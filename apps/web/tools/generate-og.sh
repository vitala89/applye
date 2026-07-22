#!/usr/bin/env bash
# Regenerates the Open Graph card (public/og/applye-og.png, 1200x630) from its
# SVG source using only macOS built-ins - no image toolchain to install.
#
# qlmanage fits the artwork by height, so the source SVG is a 1200x1200 canvas
# with the card in its centre band; the crop below cuts that band back out.
set -euo pipefail

cd "$(dirname "$0")/../public/og"

rm -f applye-og.png applye-og.svg.png
qlmanage -t -s 1200 -o . applye-og.svg >/dev/null 2>&1
sips -c 630 1200 applye-og.svg.png --out applye-og.png >/dev/null
rm -f applye-og.svg.png

sips -g pixelWidth -g pixelHeight applye-og.png
