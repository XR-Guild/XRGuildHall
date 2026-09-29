#!/usr/bin/env python3
"""Validate exported GLB files against scripts/assets/asset-spec.json.

Usage:
    python3 scripts/assets/validate_glb.py [--class NAME] [--stage export|delivery] FILE.glb [...]
"""

import argparse
import hashlib
import json
import re
import struct
import sys
from collections import defaultdict
from pathlib import Path

SPEC_PATH = Path(__file__).with_name("asset-spec.json")

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942
MODE_TRIANGLES = 4

PNG_COLOR_TYPES_MULTICHANNEL = {2, 6}
SINGLE_CHANNEL_SLOTS = (
    ("KHR_materials_iridescence", "iridescenceTexture"),
    ("KHR_materials_iridescence", "iridescenceThicknessTexture"),
    ("KHR_materials_clearcoat", "clearcoatTexture"),
    ("KHR_materials_clearcoat", "clearcoatRoughnessTexture"),
)
TEXTURE_SOURCE_EXTENSIONS = ("KHR_texture_basisu", "EXT_texture_webp", "EXT_texture_avif")


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, where, message):
        self.errors.append(f"{where}: {message}")

    def warn(self, where, message):
        self.warnings.append(f"{where}: {message}")

    def add(self, is_error, where, message):
        (self.error if is_error else self.warn)(where, message)


def load_spec(path=SPEC_PATH):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def read_glb(path):
    data = Path(path).read_bytes()
    magic, _version, length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC:
        raise ValueError("not a GLB file")
    gltf, binary = None, b""
    offset = 12
    while offset < length:
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + chunk_length]
        if chunk_type == CHUNK_JSON:
            gltf = json.loads(chunk)
        elif chunk_type == CHUNK_BIN:
            binary = chunk
        offset += 8 + chunk_length
    if gltf is None:
        raise ValueError("GLB has no JSON chunk")
    return gltf, binary


def image_size(data, mime):
    if mime == "image/png" and len(data) >= 26:
        width, height = struct.unpack_from(">II", data, 16)
        return width, height
    if mime == "image/ktx2" and len(data) >= 28:
        width, height = struct.unpack_from("<II", data, 20)
        return width, height
    if mime == "image/jpeg":
        offset = 2
        while offset + 9 < len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            marker = data[offset + 1]
            is_frame_header = 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC)
            if is_frame_header:
                height, width = struct.unpack_from(">HH", data, offset + 5)
                return width, height
            offset += 2 + struct.unpack_from(">H", data, offset + 2)[0]
    return None


def is_power_of_two(value):
    return value > 0 and value & (value - 1) == 0


def image_bytes(gltf, binary, image):
    view_index = image.get("bufferView")
    if view_index is None:
        return None
    view = gltf["bufferViews"][view_index]
    start = view.get("byteOffset", 0)
    return binary[start : start + view["byteLength"]]


def texture_image_index(texture):
    for extension in TEXTURE_SOURCE_EXTENSIONS:
        source = texture.get("extensions", {}).get(extension, {}).get("source")
        if source is not None:
            return source
    return texture.get("source")


def images_in_slot(gltf, slot_getter):
    textures = gltf.get("textures", [])
    found = set()
    for material in gltf.get("materials", []):
        info = slot_getter(material)
        if info is not None:
            index = texture_image_index(textures[info["index"]])
            if index is not None:
                found.add(index)
    return found


def primitive_stats(gltf, primitive):
    accessors = gltf["accessors"]
    position = accessors[primitive["attributes"]["POSITION"]]
    verts = position["count"]
    if "indices" in primitive:
        element_count = accessors[primitive["indices"]]["count"]
    else:
        element_count = verts
    tris = element_count // 3 if primitive.get("mode", MODE_TRIANGLES) == MODE_TRIANGLES else 0
    size = None
    if "min" in position and "max" in position:
        size = tuple(round(hi - lo, 3) for lo, hi in zip(position["min"], position["max"]))
    return tris, verts, size


def resolve_class(gltf, spec, path, override):
    if override:
        return override
    for scene in gltf.get("scenes", []):
        declared = (scene.get("extras") or {}).get("asset_class")
        if declared:
            return declared
    stem = Path(path).stem
    if stem.endswith(spec["collision_suffix"]):
        return "collision"
    return spec["file_classes"].get(stem, spec["default_class"])


def is_bad_name(name, spec):
    is_default = re.match(spec["default_name_pattern"], name, re.IGNORECASE)
    return bool(is_default or re.search(spec["duplicate_suffix_pattern"], name))


def check_names(gltf, spec, path, where, report):
    if not re.match(spec["file_name_pattern"], Path(path).stem):
        report.error(where, "file name must be lowercase words joined by - or _")
    for kind in ("meshes", "materials", "nodes"):
        unnamed = 0
        bad = []
        for item in gltf.get(kind, []):
            name = item.get("name")
            if not name:
                unnamed += 1
            elif is_bad_name(name, spec):
                bad.append(name)
        if unnamed:
            report.error(where, f"{unnamed} {kind} have no name")
        if bad:
            sample = ", ".join(sorted(set(bad))[:5])
            report.error(where, f"{len(bad)} {kind} have default or auto-numbered names ({sample})")


def check_geometry(gltf, spec, budget, where, report):
    total_tris = 0
    repeated = defaultdict(list)
    for mesh_index, mesh in enumerate(gltf.get("meshes", [])):
        label = mesh.get("name") or f"mesh {mesh_index}"
        for primitive in mesh["primitives"]:
            tris, verts, size = primitive_stats(gltf, primitive)
            total_tris += tris
            unwelded = tris >= spec["min_tris_for_weld_check"] and verts > tris * spec["max_verts_per_tri"]
            if unwelded:
                report.warn(where, f"{label}: {verts} verts for {tris} tris - weld unless hard edges are intended")
            if tris and size:
                repeated[(tris, verts, size)].append(label)
    for (tris, _verts, _size), labels in repeated.items():
        if len(labels) > 1:
            report.warn(where, f"{len(labels)} primitives look identical ({tris} tris each) - instance them")
    if total_tris > budget["max_tris"]:
        report.error(where, f"{total_tris} tris exceeds budget of {budget['max_tris']}")
    return total_tris


def check_materials(gltf, spec, budget, where, report):
    materials = gltf.get("materials", [])
    if len(materials) > budget["max_materials"]:
        report.error(where, f"{len(materials)} materials exceeds budget of {budget['max_materials']}")
    seen = defaultdict(int)
    for material in materials:
        body = {key: value for key, value in material.items() if key != "name"}
        seen[json.dumps(body, sort_keys=True)] += 1
    duplicates = sum(count - 1 for count in seen.values() if count > 1)
    if duplicates:
        report.error(where, f"{duplicates} materials are exact duplicates of another")
    used = set(gltf.get("extensionsUsed", []))
    for extension in spec["justify_extensions"]:
        if extension in used:
            report.warn(where, f"uses {extension} - confirm it is visibly worth the shading cost")


def check_textures(gltf, binary, spec, budget, stage, where, report, image_hashes):
    normal_images = images_in_slot(gltf, lambda material: material.get("normalTexture"))
    single_channel_images = set()
    for extension, slot in SINGLE_CHANNEL_SLOTS:
        single_channel_images |= images_in_slot(
            gltf, lambda material: material.get("extensions", {}).get(extension, {}).get(slot)
        )
    for index, image in enumerate(gltf.get("images", [])):
        label = image.get("name") or f"image {index}"
        mime = image.get("mimeType")
        data = image_bytes(gltf, binary, image)
        if data is None:
            continue
        image_hashes[hashlib.sha1(data).hexdigest()].append((where, label, len(data)))
        if mime not in spec["delivery_image_types"]:
            report.add(requires(spec, stage, "ktx2"), where, f"{label}: {mime} - convert to KTX2 before delivery")
        elif "ktx2" not in spec["confirmed_decoders"]:
            report.warn(where, f"{label}: KTX2 - confirm every loader registers KTX2Loader")
        if index in normal_images and mime in spec["lossy_image_types"]:
            report.error(where, f"{label}: normal map stored as {mime}")
        if index in single_channel_images and mime == "image/png" and data[25] in PNG_COLOR_TYPES_MULTICHANNEL:
            report.warn(where, f"{label}: single-channel data stored as multi-channel PNG")
        size = image_size(data, mime)
        if size is None:
            continue
        width, height = size
        if not (is_power_of_two(width) and is_power_of_two(height)):
            report.error(where, f"{label}: {width}x{height} is not power-of-two")
        if max(width, height) > budget["max_texture_px"]:
            report.error(where, f"{label}: {width}x{height} exceeds {budget['max_texture_px']}px budget")


def requires(spec, stage, decoder):
    return stage == "delivery" and decoder in spec["confirmed_decoders"]


def check_compression(gltf, spec, stage, where, report):
    used = set(gltf.get("extensionsUsed", []))
    if not used & set(spec["mesh_compression_extensions"]):
        report.add(requires(spec, stage, "meshopt"), where, "geometry is uncompressed - run optimize_glb.sh before delivery")
    elif "meshopt" not in spec["confirmed_decoders"]:
        report.warn(where, "geometry is compressed - confirm every loader registers MeshoptDecoder")


def check_file_size(path, spec, where, report):
    size = Path(path).stat().st_size
    if size > spec["max_file_bytes"]:
        report.error(where, f"{size // 1048576} MB exceeds the {spec['max_file_bytes'] // 1048576} MB per-file limit")


def check_file(path, spec, class_override, stage, report, image_hashes):
    where = Path(path).name
    try:
        gltf, binary = read_glb(path)
    except (OSError, ValueError, struct.error) as problem:
        report.error(where, f"unreadable: {problem}")
        return
    asset_class = resolve_class(gltf, spec, path, class_override)
    budget = spec["classes"].get(asset_class)
    if budget is None:
        report.error(where, f"unknown asset class '{asset_class}'")
        return
    tris = check_geometry(gltf, spec, budget, where, report)
    check_materials(gltf, spec, budget, where, report)
    check_textures(gltf, binary, spec, budget, stage, where, report, image_hashes)
    check_names(gltf, spec, path, where, report)
    check_compression(gltf, spec, stage, where, report)
    check_file_size(path, spec, where, report)
    print(f"{where}: class={asset_class} tris={tris} materials={len(gltf.get('materials', []))}")


def check_shared_images(image_hashes, report):
    for uses in image_hashes.values():
        files = sorted({where for where, _label, _size in uses})
        if len(files) > 1:
            wasted = uses[0][2] * (len(files) - 1)
            report.warn(
                "shared",
                f"same image embedded in {len(files)} files ({', '.join(files)}) - {wasted // 1024} KB duplicated",
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("files", nargs="+")
    parser.add_argument("--class", dest="asset_class")
    parser.add_argument("--stage", choices=("export", "delivery"), default="export")
    parser.add_argument("--spec", default=str(SPEC_PATH))
    args = parser.parse_args()

    spec = load_spec(args.spec)
    report = Report()
    image_hashes = defaultdict(list)
    for path in args.files:
        check_file(path, spec, args.asset_class, args.stage, report, image_hashes)
    check_shared_images(image_hashes, report)

    for line in report.warnings:
        print(f"WARN  {line}")
    for line in report.errors:
        print(f"ERROR {line}")
    if spec.get("provisional"):
        print("NOTE  budgets are provisional until a minimum target device is chosen")
    print(f"{len(report.errors)} errors, {len(report.warnings)} warnings")
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
