#!/usr/bin/env bash
# Post-export delivery step: dedupes, instances, welds, compresses geometry and converts textures to KTX2.
#
# Usage: scripts/assets/optimize_glb.sh INPUT.glb OUTPUT.glb [--skip-textures]
set -euo pipefail

if [ "$#" -lt 2 ]; then
  sed -n '2,4p' "$0"
  exit 2
fi

input="$1"
output="$2"
texture_compress="ktx2"

if [ -e "$output" ] && [ "$(cd "$(dirname "$input")" && pwd -P)/$(basename "$input")" = "$(cd "$(dirname "$output")" && pwd -P)/$(basename "$output")" ]; then
  echo "Output must differ from input; the source GLB is never overwritten." >&2
  exit 1
fi

if [ "${3:-}" = "--skip-textures" ]; then
  texture_compress="false"
elif ! command -v ktx >/dev/null 2>&1; then
  echo "KTX-Software (the 'ktx' command) is required for texture conversion." >&2
  echo "Install it, or pass --skip-textures to compress geometry only." >&2
  exit 1
fi

# flatten, join, palette and simplify are off because they rename or merge parts
# and change silhouettes; those decisions belong in the source file.
npx --yes @gltf-transform/cli@4 optimize "$input" "$output" \
  --compress meshopt \
  --texture-compress "$texture_compress" \
  --flatten false \
  --join false \
  --palette false \
  --simplify false
