"""Validate a .blend file against the authoring rules in docs/ASSET-STANDARDS.md.

Usage:
    blender --background FILE.blend --python scripts/assets/validate_blend.py

Read-only: the file is never saved.
"""

import re
import sys
from collections import defaultdict
from pathlib import Path

import bpy

sys.path.append(str(Path(__file__).parent))
from validate_glb import Report, is_bad_name, load_spec  # noqa: E402

README_TEXT_NAME = "README"
COLLISION_SUFFIX = "-collision"
REFERENCE_SUFFIX = "-reference"
SCALE_TOLERANCE = 1e-4
PURGEABLE_DATA = ("meshes", "materials", "images", "textures", "node_groups", "curves")
GEOMETRY_TYPES = {"MESH", "CURVE", "SURFACE", "META", "FONT"}


def exported_collections():
    return [c for c in bpy.context.scene.collection.children if not c.name.endswith(REFERENCE_SUFFIX)]


def objects_in(collection, skip_suffixes=()):
    found = list(collection.objects)
    for child in collection.children:
        if not child.name.endswith(skip_suffixes):
            found.extend(objects_in(child, skip_suffixes))
    return found


def check_scene(report):
    units = bpy.context.scene.unit_settings
    if units.system != "METRIC" or abs(units.scale_length - 1.0) > SCALE_TOLERANCE:
        report.error("scene", "units must be metric with unit scale 1.0 (1 unit = 1 m)")
    if README_TEXT_NAME not in bpy.data.texts:
        others = ", ".join(text.name for text in bpy.data.texts) or "none"
        report.error("scene", f"missing '{README_TEXT_NAME}' text datablock describing the file (text blocks: {others})")
    loose = [obj.name for obj in bpy.context.scene.collection.objects]
    if loose:
        report.error("scene", f"{len(loose)} objects sit outside an asset collection ({', '.join(loose[:5])})")


def check_names(spec, report):
    groups = {
        "collections": [c for c in bpy.data.collections if c.users],
        "objects": [o for o in bpy.data.objects if o.users],
        "materials": [m for m in bpy.data.materials if m.users],
    }
    for kind, items in groups.items():
        bad = [item.name for item in items if is_bad_name(item.name, spec)]
        if bad:
            report.error(kind, f"{len(bad)} have default or auto-numbered names ({', '.join(sorted(bad)[:5])})")
    for collection in exported_collections():
        if not re.match(spec["file_name_pattern"], collection.name):
            report.error(collection.name, "asset collection name must be lowercase words joined by - or _ (it becomes the file name)")
    mismatched = [
        obj.name
        for obj in groups["objects"]
        if obj.type == "MESH" and obj.data.users == 1 and obj.data.name != obj.name
    ]
    if mismatched:
        report.warn("objects", f"{len(mismatched)} have mesh data named differently ({', '.join(mismatched[:5])})")


def check_transforms(report):
    unapplied = [
        obj.name
        for obj in bpy.data.objects
        if obj.users and obj.type in GEOMETRY_TYPES and any(abs(axis - 1.0) > SCALE_TOLERANCE for axis in obj.scale)
    ]
    if unapplied:
        report.error("objects", f"{len(unapplied)} have unapplied scale ({', '.join(unapplied[:5])})")


def check_data_hygiene(report):
    for kind in PURGEABLE_DATA:
        orphans = [block.name for block in getattr(bpy.data, kind) if block.users == 0]
        if orphans:
            report.error(kind, f"{len(orphans)} orphan datablocks - purge before saving ({', '.join(orphans[:5])})")
    for image in bpy.data.images:
        if image.source != "FILE":
            continue
        if image.packed_file:
            report.error("images", f"{image.name} is packed - keep textures as external files")
        elif not image.filepath.startswith("//"):
            report.error("images", f"{image.name} uses an absolute path")


def check_repeated_meshes(report):
    groups = defaultdict(list)
    for mesh in bpy.data.meshes:
        if mesh.users and mesh.polygons:
            bounds = [vertex.co for vertex in mesh.vertices]
            size = tuple(
                round(max(co[axis] for co in bounds) - min(co[axis] for co in bounds), 3) for axis in range(3)
            )
            groups[(len(mesh.vertices), len(mesh.polygons), size)].append(mesh.name)
    for (_verts, polys, _size), names in groups.items():
        if len(names) > 1:
            report.warn(
                "meshes",
                f"{len(names)} separate meshes look identical ({polys} faces: {', '.join(names[:5])}) "
                "- use linked duplicates",
            )


def evaluated_triangles(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    count = len(mesh.loop_triangles)
    evaluated.to_mesh_clear()
    return count


def check_budgets(spec, report):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    skip = (COLLISION_SUFFIX, REFERENCE_SUFFIX)
    for collection in exported_collections():
        where = collection.name
        asset_class = collection.get("asset_class")
        geometry = [obj for obj in objects_in(collection, skip) if obj.type in GEOMETRY_TYPES]
        counts = {obj.name: evaluated_triangles(obj, depsgraph) for obj in geometry}
        tris = sum(counts.values())
        heavy_curves = sorted(
            ((counts[obj.name], obj.name) for obj in geometry
             if obj.type != "MESH" and counts[obj.name] > spec["max_tris_per_curve_object"]),
            reverse=True,
        )
        if heavy_curves:
            sample = ", ".join(f"{name} ({count})" for count, name in heavy_curves[:3])
            report.warn(
                where,
                f"{len(heavy_curves)} curve/text objects export over {spec['max_tris_per_curve_object']} tris each "
                f"- lower their resolution ({sample})",
            )
        materials = {slot.material.name for obj in geometry for slot in obj.material_slots if slot.material}
        ngons = sum(
            1 for obj in geometry if obj.type == "MESH" for polygon in obj.data.polygons if len(polygon.vertices) > 4
        )
        print(f"{where}: class={asset_class} objects={len(geometry)} tris={tris} materials={len(materials)}")
        budget = spec["classes"].get(asset_class)
        if budget is None:
            report.error(where, f"custom property asset_class is missing or unknown ('{asset_class}')")
            continue
        if tris > budget["max_tris"]:
            report.error(where, f"{tris} tris exceeds budget of {budget['max_tris']}")
        if len(materials) > budget["max_materials"]:
            report.error(where, f"{len(materials)} materials exceeds budget of {budget['max_materials']}")
        if ngons:
            report.warn(where, f"{ngons} n-gons - triangulation on export is unpredictable")


def main():
    spec = load_spec()
    report = Report()
    check_scene(report)
    check_names(spec, report)
    check_transforms(report)
    check_data_hygiene(report)
    check_repeated_meshes(report)
    check_budgets(spec, report)

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
