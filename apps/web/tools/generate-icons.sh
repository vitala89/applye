#!/usr/bin/env bash
# Regenerates the browser icons from public/brand/applye-favicon.svg using only
# macOS built-ins and python3 - no image toolchain to install.
#
# Produces:
#   public/favicon.ico        16 + 32 + 48 px, for browsers that ignore the SVG
#   public/apple-touch-icon.png  180 px, for iOS home screens and Safari
#
# The SVG stays the primary icon: it is linked first in index.html and is what
# any modern browser actually uses. The raster files exist because Safari and
# older engines fall back to them, and the fallback used to be the Nx logo the
# workspace generator left behind.
#
# `sips` cannot write .ico, so the container is assembled here: an ICO file is a
# short header, one directory entry per size, and the PNG bytes appended - which
# python3 can do from the standard library alone.
set -euo pipefail

cd "$(dirname "$0")/../public"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# qlmanage renders an SVG at its intrinsic size and pads the rest of the box
# rather than scaling up, and the source is a 32x32 icon - asking for 180 px
# would return the mark in the corner of a mostly empty square. So render once
# from a copy whose width/height are large (the viewBox is untouched, so the
# artwork is identical) and let sips do the downscaling.
# The rounded corner is also dropped here, deliberately. QuickLook's SVG
# rasteriser applies `rx` to the first corner only, which produces a tile
# rounded at the top left and square everywhere else. A square tile is the right
# source anyway: iOS masks the touch icon into its own squircle, and at 16 px in
# a browser tab a 7-unit radius is invisible. The SVG favicon keeps its corners
# and is what a modern browser renders.
sed -e 's/width="32" height="32"/width="1024" height="1024"/' -e 's/ rx="7"//' \
  brand/applye-favicon.svg >"$work/applye-favicon-1024.svg"
qlmanage -t -s 1024 -o "$work" "$work/applye-favicon-1024.svg" >/dev/null 2>&1

for size in 16 32 48 180; do
  sips -Z "$size" "$work/applye-favicon-1024.svg.png" --out "$work/icon-$size.png" >/dev/null
done

cp "$work/icon-180.png" apple-touch-icon.png

python3 - "$work" <<'PY'
import struct, sys
from pathlib import Path

work = Path(sys.argv[1])
sizes = [16, 32, 48]
pngs = [(s, (work / f"icon-{s}.png").read_bytes()) for s in sizes]

# ICONDIR: reserved, type 1 (icon), image count.
out = bytearray(struct.pack("<HHH", 0, 1, len(pngs)))
offset = 6 + 16 * len(pngs)
for size, data in pngs:
    # ICONDIRENTRY: width, height (0 means 256), palette, reserved, planes,
    # bit depth, byte length, offset. PNG payloads are legal since Vista.
    out += struct.pack(
        "<BBBBHHII", size, size, 0, 0, 1, 32, len(data), offset
    )
    offset += len(data)
for _, data in pngs:
    out += data

Path("favicon.ico").write_bytes(bytes(out))
print(f"favicon.ico: {len(out)} bytes, sizes {sizes}")
PY

sips -g pixelWidth -g pixelHeight apple-touch-icon.png
