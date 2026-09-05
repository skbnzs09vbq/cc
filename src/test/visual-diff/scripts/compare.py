#!/usr/bin/env python3
"""
Compare two screenshots and produce a diff-overlay image and a
side-by-side composite. Prints the diff bounding box (if any) and the
percentage of changed pixels to stdout.

Usage:
    python compare.py <before> <after> <diff_output> <sidebyside_output>
"""

import sys

from PIL import Image, ImageChops, ImageDraw


def pad_to_match(a: Image.Image, b: Image.Image):
    """Pad both images with white to the same size so diffing never errors on size mismatch."""
    width = max(a.width, b.width)
    height = max(a.height, b.height)

    def pad(img):
        if img.size == (width, height):
            return img
        canvas = Image.new("RGB", (width, height), "white")
        canvas.paste(img, (0, 0))
        return canvas

    return pad(a), pad(b)


def main():
    if len(sys.argv) != 5:
        print("Usage: python compare.py <before> <after> <diff_output> <sidebyside_output>")
        sys.exit(1)

    before_path, after_path, diff_output, sidebyside_output = sys.argv[1:5]

    before = Image.open(before_path).convert("RGB")
    after = Image.open(after_path).convert("RGB")
    before, after = pad_to_match(before, after)

    # --- diff overlay: the "after" image with changed regions highlighted in red ---
    diff = ImageChops.difference(before, after)
    diff_gray = diff.convert("L")
    mask = diff_gray.point(lambda p: 255 if p > 24 else 0)  # threshold out anti-aliasing noise

    overlay = after.copy()
    red_layer = Image.new("RGB", overlay.size, (255, 0, 0))
    overlay = Image.composite(red_layer, overlay, mask)
    blended = Image.blend(after, overlay, 0.5)
    blended.save(diff_output)

    # --- side-by-side composite ---
    gap = 8
    side = Image.new(
        "RGB", (before.width + after.width + gap, max(before.height, after.height)), "white"
    )
    side.paste(before, (0, 0))
    side.paste(after, (before.width + gap, 0))
    draw = ImageDraw.Draw(side)
    draw.line([(before.width + gap // 2, 0), (before.width + gap // 2, side.height)], fill="black", width=2)
    side.save(sidebyside_output)

    # --- summary ---
    bbox = mask.getbbox()
    changed_pixels = sum(1 for v in mask.getdata() if v)
    total_pixels = mask.width * mask.height
    percent = (changed_pixels / total_pixels) * 100 if total_pixels else 0

    if bbox:
        print(f"DIFF_DETECTED: true")
        print(f"DIFF_BBOX: left={bbox[0]} top={bbox[1]} right={bbox[2]} bottom={bbox[3]}")
        print(f"DIFF_PERCENT: {percent:.2f}%")
    else:
        print("DIFF_DETECTED: false")


if __name__ == "__main__":
    main()
