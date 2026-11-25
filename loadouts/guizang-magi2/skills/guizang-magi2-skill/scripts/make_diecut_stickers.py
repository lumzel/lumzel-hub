#!/usr/bin/env python3
"""
Pop-Art Die-Cut Sticker Baker & Sprite-Sheet Component Splitter
===============================================================
Converts native transparent-background PNGs (e.g., from Seedream 5.5) into
crisp pop-art vinyl die-cut stickers using exact Euclidean Distance Fields (EDF):
  - Cleans faint alpha halo fringes
  - Adds smooth, rounded inner white vinyl border + outer bold black ink contour
  - Optional soft drop shadow
  - Optional --split-components mode to automatically segment multi-object
    transparent sheets (beans, ice cubes, props) into individual sticker PNGs.

Dependencies: pillow, numpy, scipy
Example:
  uv run --with pillow --with numpy --with scipy python3 make_diecut_stickers.py \
      input.png output_sticker.png --white-px 14 --black-px 5 --shadow
"""

import argparse
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import (
    binary_closing,
    binary_fill_holes,
    distance_transform_edt,
    gaussian_filter,
    label,
)


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        raise ValueError(f"Expected 6-digit hex color, got: {hex_color}")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def clean_and_trim(img: Image.Image, alpha_threshold: int = 24) -> Image.Image:
    """Convert to RGBA, suppress faint halo fringe, and trim empty transparent margins."""
    rgba = np.array(img.convert("RGBA"), dtype=np.uint8)
    alpha = rgba[:, :, 3]
    # Soft ramp cleanup below threshold to eliminate semi-transparent fringe dust
    mask = alpha >= alpha_threshold
    if not np.any(mask):
        raise ValueError("Image has no opaque pixels above alpha threshold.")
    ys, xs = np.where(mask)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    cropped = rgba[y0:y1, x0:x1].copy()
    # Zero out faint noise pixels outside core alpha
    cropped[cropped[:, :, 3] < max(8, alpha_threshold // 3), 3] = 0
    return Image.fromarray(cropped, mode="RGBA")


def bake_diecut_sticker(
    img: Image.Image,
    white_px: int = 14,
    black_px: int = 5,
    inner_color: tuple[int, int, int] = (255, 255, 255),
    outer_color: tuple[int, int, int] = (17, 17, 17),
    alpha_threshold: int = 32,
    close_gaps_px: int = 2,
    shadow: bool = False,
    shadow_offset: tuple[int, int] = (6, 8),
    shadow_blur: float = 8.0,
    shadow_opacity: float = 0.24,
    extra_pad: int = 6,
) -> Image.Image:
    """Bake smooth EDF pop-art die-cut white+black border around a transparent RGBA image."""
    trimmed = clean_and_trim(img, alpha_threshold=alpha_threshold)
    src = np.array(trimmed, dtype=np.float32)
    h, w, _ = src.shape

    border_total = white_px + black_px
    sh_pad = int(max(abs(shadow_offset[0]), abs(shadow_offset[1])) + shadow_blur * 2.5) if shadow else 0
    pad = border_total + sh_pad + extra_pad

    canvas_h, canvas_w = h + 2 * pad, w + 2 * pad
    padded = np.zeros((canvas_h, canvas_w, 4), dtype=np.float32)
    padded[pad : pad + h, pad : pad + w] = src

    # Core binary silhouette mask
    core_mask = padded[:, :, 3] >= alpha_threshold
    if close_gaps_px > 0:
        struct = np.ones((2 * close_gaps_px + 1, 2 * close_gaps_px + 1), dtype=bool)
        core_mask = binary_closing(core_mask, structure=struct)
    core_mask = binary_fill_holes(core_mask)

    # Exact Euclidean distance outside the silhouette (smooth, anti-aliased round corners!)
    dist = distance_transform_edt(~core_mask)

    # Anti-aliased 1.2px edge transitions for crisp vector-like print quality
    aa = 1.2
    outer_alpha = np.clip((border_total + 0.5 - dist) / aa, 0.0, 1.0)
    inner_alpha = np.clip((white_px + 0.5 - dist) / aa, 0.0, 1.0)

    out = np.zeros((canvas_h, canvas_w, 4), dtype=np.float32)

    # Layer 0: Optional soft offset drop shadow
    if shadow and shadow_opacity > 0:
        dx, dy = shadow_offset
        sh_mask = np.zeros((canvas_h, canvas_w), dtype=np.float32)
        src_y0 = max(0, -dy)
        src_y1 = min(canvas_h, canvas_h - dy)
        src_x0 = max(0, -dx)
        src_x1 = min(canvas_w, canvas_w - dx)
        dst_y0 = max(0, dy)
        dst_y1 = dst_y0 + (src_y1 - src_y0)
        dst_x0 = max(0, dx)
        dst_x1 = dst_x0 + (src_x1 - src_x0)
        sh_mask[dst_y0:dst_y1, dst_x0:dst_x1] = outer_alpha[src_y0:src_y1, src_x0:src_x1]
        sh_alpha = gaussian_filter(sh_mask, sigma=shadow_blur) * shadow_opacity
        out[:, :, 0:3] = 0.0
        out[:, :, 3] = sh_alpha

    def alpha_over(dst_rgba: np.ndarray, rgb: tuple[int, int, int], a: np.ndarray) -> np.ndarray:
        src_a = a[:, :, None]
        dst_a = dst_rgba[:, :, 3:4]
        out_a = src_a + dst_a * (1.0 - src_a)
        safe_a = np.where(out_a > 1e-6, out_a, 1.0)
        rgb_arr = np.array(rgb, dtype=np.float32)[None, None, :]
        out_rgb = (rgb_arr * src_a + dst_rgba[:, :, 0:3] * dst_a * (1.0 - src_a)) / safe_a
        return np.concatenate([out_rgb, out_a], axis=2)

    # Layer 1: Outer bold black ink contour
    if black_px > 0:
        out = alpha_over(out, outer_color, outer_alpha)

    # Layer 2: Inner white vinyl die-cut border
    if white_px > 0:
        out = alpha_over(out, inner_color, inner_alpha)

    # Layer 3: Original studio cutout composited cleanly on top
    fg_a = (padded[:, :, 3:4] / 255.0)
    dst_a = out[:, :, 3:4]
    fin_a = fg_a + dst_a * (1.0 - fg_a)
    safe_fin = np.where(fin_a > 1e-6, fin_a, 1.0)
    fin_rgb = (padded[:, :, 0:3] * fg_a + out[:, :, 0:3] * dst_a * (1.0 - fg_a)) / safe_fin
    final = np.concatenate([np.clip(fin_rgb, 0, 255), np.clip(fin_a * 255.0, 0, 255)], axis=2)

    # Tight final trim with small breathing margin
    vis = final[:, :, 3] > 2
    ys, xs = np.where(vis)
    y0 = max(0, int(ys.min()) - 2)
    y1 = min(canvas_h, int(ys.max()) + 3)
    x0 = max(0, int(xs.min()) - 2)
    x1 = min(canvas_w, int(xs.max()) + 3)
    return Image.fromarray(final[y0:y1, x0:x1].astype(np.uint8), mode="RGBA")


def split_components(
    img: Image.Image, alpha_threshold: int = 32, min_area_px: int = 1200
) -> list[Image.Image]:
    """Segment disconnected opaque objects from a transparent sprite sheet (left-to-right, top-to-bottom)."""
    rgba = np.array(img.convert("RGBA"), dtype=np.uint8)
    mask = rgba[:, :, 3] >= alpha_threshold
    labeled, num = label(mask)
    items = []
    for comp_id in range(1, num + 1):
        comp_mask = labeled == comp_id
        area = int(comp_mask.sum())
        if area < min_area_px:
            continue
        ys, xs = np.where(comp_mask)
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        sub = rgba[y0:y1, x0:x1].copy()
        # Mask out neighboring components inside the bounding box
        sub[~comp_mask[y0:y1, x0:x1]] = 0
        cx, cy = float(xs.mean()), float(ys.mean())
        items.append((cy // 150, cx, Image.fromarray(sub, mode="RGBA")))
    items.sort(key=lambda t: (t[0], t[1]))
    return [it[2] for it in items]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Bake pop-art EDF die-cut stickers from transparent PNGs.")
    p.add_argument("input", help="Input PNG file or directory of PNGs")
    p.add_argument("output", help="Output PNG file or directory")
    p.add_argument("--white-px", type=int, default=14, help="Inner vinyl border width in px (default: 14)")
    p.add_argument("--black-px", type=int, default=5, help="Outer ink contour width in px (default: 5)")
    p.add_argument("--inner-color", default="#FFFFFF", help="Inner border hex color (default: #FFFFFF)")
    p.add_argument("--outer-color", default="#111111", help="Outer contour hex color (default: #111111)")
    p.add_argument("--alpha-threshold", type=int, default=32, help="Alpha mask threshold 0-255 (default: 32)")
    p.add_argument("--shadow", action="store_true", help="Add subtle soft drop shadow behind sticker")
    p.add_argument("--split-components", action="store_true", help="Auto-split disconnected objects in sprite sheet")
    p.add_argument("--min-area", type=int, default=1200, help="Min pixel area for split components (default: 1200)")
    p.add_argument("--prefix", default="item", help="Filename prefix when using --split-components")
    p.add_argument("--save-clean", action="store_true", help="Also export trimmed clean PNG alongside sticker")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    in_path = Path(args.input)
    out_path = Path(args.output)
    inner_rgb = hex_to_rgb(args.inner_color)
    outer_rgb = hex_to_rgb(args.outer_color)

    def process_one(src_img: Image.Image, dest_file: Path) -> None:
        dest_file.parent.mkdir(parents=True, exist_ok=True)
        if args.save_clean:
            clean = clean_and_trim(src_img, alpha_threshold=args.alpha_threshold)
            clean_file = dest_file.with_name(f"{dest_file.stem}_clean{dest_file.suffix}")
            clean.save(clean_file)
        sticker = bake_diecut_sticker(
            src_img,
            white_px=args.white_px,
            black_px=args.black_px,
            inner_color=inner_rgb,
            outer_color=outer_rgb,
            alpha_threshold=args.alpha_threshold,
            shadow=args.shadow,
        )
        sticker.save(dest_file)
        print(f"[OK] {dest_file} ({sticker.width}x{sticker.height})")

    if in_path.is_dir():
        out_path.mkdir(parents=True, exist_ok=True)
        pngs = sorted(p for p in in_path.iterdir() if p.suffix.lower() == ".png")
        if not pngs:
            sys.exit(f"No PNG files found in {in_path}")
        for png in pngs:
            img = Image.open(png)
            process_one(img, out_path / png.name)
    elif in_path.is_file():
        img = Image.open(in_path)
        if args.split_components:
            out_path.mkdir(parents=True, exist_ok=True)
            comps = split_components(img, alpha_threshold=args.alpha_threshold, min_area_px=args.min_area)
            if not comps:
                sys.exit(f"No components >= {args.min_area}px found in {in_path}")
            for idx, comp_img in enumerate(comps, start=1):
                process_one(comp_img, out_path / f"{args.prefix}_{idx}.png")
        else:
            dest = (out_path / in_path.name) if out_path.is_dir() else out_path
            process_one(img, dest)
    else:
        sys.exit(f"Input path does not exist: {in_path}")


if __name__ == "__main__":
    main()
