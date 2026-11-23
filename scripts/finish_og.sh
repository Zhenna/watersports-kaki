#!/usr/bin/env bash
# Turns a screenshot of one picture from frontend/og-maker.html into the finished link preview image.
#
#     bash scripts/finish_og.sh ~/Downloads/the-screenshot.png light
#     bash scripts/finish_og.sh ~/Downloads/the-other-screenshot.png dark
#
# It checks the screenshot has the right shape (1200 by 630, or any larger size of that shape, give or take a pixel),
# scales it to exactly 1200 by 630, saves it as frontend/og-app-light.png or frontend/og-app-dark.png, and checks the size
# stays under 300 KB, because WhatsApp can skip a heavier picture. It changes nothing else.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
src="$1"; version="$2"
case "$version" in
  light|dark) ;;
  *) echo "The second word must be light or dark, not '$version'."; exit 2 ;;
esac
if [ ! -f "$src" ]; then echo "Not a file: $src"; exit 2; fi

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/frontend/og-app-$version.png"

w=$(sips -g pixelWidth "$src" | awk '/pixelWidth/ {print $2}')
h=$(sips -g pixelHeight "$src" | awk '/pixelHeight/ {print $2}')
if [ -z "$w" ] || [ -z "$h" ]; then echo "Could not read the size of $src. Is it a PNG screenshot?"; exit 2; fi
abs() { if [ "$1" -lt 0 ]; then echo $(( -$1 )); else echo "$1"; fi; }
diff=$(abs $(( h * 1200 - w * 630 )))              # zero when the shape is exactly 1200 by 630, whatever the scale
if [ "$diff" -gt 2400 ]; then                        # more than a pixel or two off
  echo "This screenshot is ${w} by ${h}, which is not the 1200 by 630 shape."
  echo "Capture the picture box itself: in Chrome's Inspect panel, click the line div class=\"og\" id=\"$version\"."
  echo "It is the whole picture that turns blue when you hover that line. A small size such as 200 by 28 usually means the heading above it."
  exit 1
fi
if [ "$w" -lt 1200 ]; then
  echo "This screenshot has the right shape but is only ${w} by ${h}, smaller than 1200 by 630, so it would come out blurry."
  echo "Set Chrome's zoom to 100% or more, reload the page, and capture again."
  exit 1
fi

sips --resampleWidth 1200 "$src" --out "$out" >/dev/null
oh=$(sips -g pixelHeight "$out" | awk '/pixelHeight/ {print $2}')
if [ "$oh" -gt 630 ]; then                      # a capture can be a pixel too tall; trim it
  sips -c 630 1200 "$out" >/dev/null
  echo "Trimmed $((oh - 630)) extra pixel row(s)."
fi
ow=$(sips -g pixelWidth "$out" | awk '/pixelWidth/ {print $2}')
oh=$(sips -g pixelHeight "$out" | awk '/pixelHeight/ {print $2}')
bytes=$(wc -c < "$out" | tr -d ' ')
echo "Saved frontend/og-app-$version.png: ${ow} by ${oh}, ${bytes} bytes"
if [ "$ow" -ne 1200 ] || [ "$oh" -ne 630 ]; then rm -f "$out"; echo "The result was ${ow} by ${oh}, not 1200 by 630. Nothing was saved."; exit 1; fi
if [ "$bytes" -gt 300000 ]; then
  rm -f "$out"
  echo "That is over 300 KB, so WhatsApp may skip it. Nothing was saved. Tell me and I will help make it smaller."
  exit 1
fi
