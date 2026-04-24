#!/usr/bin/env bash
# Re-rasterise every SVG under apps/web/public/brand/ into PNG at
# useful sizes, plus a WebP variant at 1× for web delivery.
#
# Sizes (width × height):
#   banner    1280×320 · 2560×640 · 3840×960
#   lockup     960×160 · 1920×320 · 3840×640
#   wordmark   720×160 · 1440×320 · 2880×640
#   signal     512×256 · 1024×512 · 2048×1024 · 2560×1280
#   mark        128² ·  256² ·  512² · 1024² · 2048² · 4096²
#   avatar      400² ·  800² · 2048² · 4096²
#   og        1200×630 · 2400×1260 · 3840×2016
#   favicon      32 ·  180 ·  512 (maskable)
#
# Every output PNG is then run through oxipng -o 4 (near-lossless
# size shrink). Then we emit a WebP at 1× for each asset for places
# that prefer the lighter format. Re-run any time you edit an SVG.
#
# Requires: rsvg-convert, oxipng, cwebp.

set -euo pipefail

brand_dir="$(cd "$(dirname "$0")/.." && pwd)/apps/web/public/brand"
png="$brand_dir/png"
webp="$brand_dir/png/webp"

mkdir -p "$png" "$webp"

render() {
  local svg="$1" out="$2" w="$3" h="$4"
  rsvg-convert "$brand_dir/$svg" -w "$w" -h "$h" -o "$png/$out"
}

render_sq() { render "$1" "$2" "$3" "$3"; }

echo "== rasterising =="
render    banner.svg   banner.png        1280  320
render    banner.svg   banner@2x.png     2560  640
render    banner.svg   banner-4k.png     3840  960

render    lockup.svg   lockup.png         960  160
render    lockup.svg   lockup@2x.png     1920  320
render    lockup.svg   lockup-4k.png     3840  640

render    wordmark.svg wordmark.png       720  160
render    wordmark.svg wordmark@2x.png   1440  320
render    wordmark.svg wordmark-4k.png   2880  640

render    signal.svg   signal.png         512  256
render    signal.svg   signal@2x.png     1024  512
render    signal.svg   signal-2k.png     2048 1024
render    signal.svg   signal-4k.png     2560 1280

render_sq mark.svg     mark-128.png       128
render_sq mark.svg     mark-256.png       256
render_sq mark.svg     mark-512.png       512
render_sq mark.svg     mark-1024.png     1024
render_sq mark.svg     mark-2048.png     2048
render_sq mark.svg     mark-4096.png     4096

render_sq avatar.svg   avatar.png         400
render_sq avatar.svg   avatar@2x.png      800
render_sq avatar.svg   avatar-2k.png     2048
render_sq avatar.svg   avatar-4k.png     4096

render    og.svg       og.png            1200  630
render    og.svg       og@2x.png         2400 1260
render    og.svg       og-4k.png         3840 2016

render_sq favicon.svg  favicon-32.png      32
render_sq favicon.svg  favicon-180.png    180
render_sq favicon.svg  favicon-512.png    512

echo "== optimising PNG with oxipng =="
# -o 4 is a solid speed/size balance. --strip safe drops metadata
# chunks that nothing reads (date, sw, etc).
oxipng -o 4 --strip safe -q "$png"/*.png

echo "== emitting WebP 1× for web delivery =="
# Quality 88 is the sweet spot: near-visually-lossless for flat
# graphics like ours (the source is vector, no texture to preserve),
# while cutting file size roughly in half vs optimised PNG.
emit_webp() {
  local png_in="$1" webp_out="$2"
  cwebp -quiet -q 88 "$png/$png_in" -o "$webp/$webp_out"
}

emit_webp banner.png     banner.webp
emit_webp banner@2x.png  banner@2x.webp
emit_webp lockup.png     lockup.webp
emit_webp wordmark.png   wordmark.webp
emit_webp signal.png     signal.webp
emit_webp signal@2x.png  signal@2x.webp
emit_webp mark-512.png   mark.webp
emit_webp mark-1024.png  mark@2x.webp
emit_webp avatar.png     avatar.webp
emit_webp avatar@2x.png  avatar@2x.webp
emit_webp og.png         og.webp
emit_webp og@2x.png      og@2x.webp

echo "== done =="
du -sh "$png" "$webp" 2>/dev/null || true
