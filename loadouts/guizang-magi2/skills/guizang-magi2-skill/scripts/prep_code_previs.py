#!/usr/bin/env python3
"""
Code-to-Video Previs Sanitizer, Contact-Sheet Inspector & Top-Bottom Comparator
===============================================================================
Prepares deterministic code-generated motion greybox videos before uploading to
LibTV `magi-2` (`reference` mode), and builds side-by-side verification videos:

  1. Previs Prep Mode:
     - Physically strips ALL audio tracks (`-an`) so synthetic code beeps never
       pollute MAGI-2's unified audio-video generation
     - Normalizes stream to 1920x1080, 25fps, H.264 `yuv420p`
     - Optionally renders a 4x3 (12-frame) diagnostic contact sheet so the Agent
       can visually verify zero persistent debug wireframes / HUD bars
  2. Compare Mode (`--compare`):
     - Stacks the muted code previs (top) and MAGI-2 stylized output (bottom)
       into a single 1920x1080 MP4 while keeping MAGI-2's generated audio track.

Requires `ffmpeg` and `ffprobe` on PATH. Zero third-party Python dependencies.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


def ensure_ffmpeg() -> None:
    for bin_name in ("ffmpeg", "ffprobe"):
        if not shutil.which(bin_name):
            sys.exit(f"[ERROR] `{bin_name}` not found on PATH. Install via `brew install ffmpeg`.")


def probe_media(path: Path) -> dict:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate",
        "-of",
        "json",
        str(path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def prep_previs(
    src: Path,
    dst: Path,
    width: int = 1920,
    height: int = 1080,
    fps: int = 25,
    sheet_out: Path | None = None,
) -> None:
    if not src.is_file():
        sys.exit(f"[ERROR] Input video not found: {src}")

    dst.parent.mkdir(parents=True, exist_ok=True)
    vf = (
        f"fps={fps},"
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,"
        f"format=yuv420p"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-an",  # CRITICAL: strip all audio streams!
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-preset",
        "fast",
        "-movflags",
        "+faststart",
        str(dst),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)

    info = probe_media(dst)
    streams = info.get("streams", [])
    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
    video_streams = [s for s in streams if s.get("codec_type") == "video"]
    duration = float(info.get("format", {}).get("duration", 0.0))

    if audio_streams:
        sys.exit(f"[ERROR] Audio stream still present in {dst}!")
    if not video_streams:
        sys.exit(f"[ERROR] No video stream found in {dst}!")

    vs = video_streams[0]
    print(
        f"[OK] Sanitized muted previs: {dst} "
        f"({vs.get('width')}x{vs.get('height')} @ {vs.get('r_frame_rate')}fps, "
        f"{duration:.2f}s, audio_streams=0)"
    )

    if sheet_out is not None:
        sheet_out.parent.mkdir(parents=True, exist_ok=True)
        # Sample 12 evenly spaced frames across the duration into a 4x3 contact sheet
        # (Uses pure scale + tile filters so it works on all ffmpeg builds even without libfreetype/drawtext)
        interval = max(duration / 12.0, 0.08)
        sheet_vf = (
            f"fps=1/{interval:.4f},"
            f"scale=480:270:force_original_aspect_ratio=decrease,"
            f"pad=480:270:(ow-iw)/2:(oh-ih)/2:black,"
            f"tile=4x3:padding=6:margin=6:color=0x141418"
        )
        sheet_cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(dst),
            "-vf",
            sheet_vf,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(sheet_out),
        ]
        subprocess.run(sheet_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        print(f"[OK] 12-frame diagnostic contact sheet: {sheet_out}")
        print("     -> Inspect this image to confirm zero persistent wireframes/HUD bars before uploading to LibTV.")


def build_top_bottom_compare(previs: Path, final_vid: Path, out_path: Path) -> None:
    for p in (previs, final_vid):
        if not p.is_file():
            sys.exit(f"[ERROR] Input video not found: {p}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    filter_complex = (
        "[0:v]scale=1920:540:force_original_aspect_ratio=decrease,"
        "pad=1920:540:(ow-iw)/2:(oh-ih)/2:black[top];"
        "[1:v]scale=1920:540:force_original_aspect_ratio=decrease,"
        "pad=1920:540:(ow-iw)/2:(oh-ih)/2:black[bot];"
        "[top][bot]vstack=inputs=2,format=yuv420p[v]"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(previs),
        "-i",
        str(final_vid),
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        "-map",
        "1:a?",
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-preset",
        "fast",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    print(f"[OK] Top-bottom comparison video: {out_path}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Sanitize Code-to-Video previs (strip audio + 25fps + contact sheet) or build top/bottom comparison."
    )
    p.add_argument("inputs", nargs="+", help="Previs mode: <raw.mp4> <mute_out.mp4> | Compare mode: <previs.mp4> <final.mp4>")
    p.add_argument("--sheet", default=None, help="Output path for 4x3 (12-frame) diagnostic contact sheet JPG/PNG")
    p.add_argument("--fps", type=int, default=25, help="Target frame rate for previs normalization (default: 25)")
    p.add_argument("--width", type=int, default=1920, help="Target width (default: 1920)")
    p.add_argument("--height", type=int, default=1080, help="Target height (default: 1080)")
    p.add_argument("--compare", action="store_true", help="Stack <previs.mp4> (top) and <final.mp4> (bottom) into -o output")
    p.add_argument("-o", "--output", default="compare_top_bottom.mp4", help="Output path when using --compare")
    return p.parse_args()


def main() -> None:
    ensure_ffmpeg()
    args = parse_args()

    if args.compare:
        if len(args.inputs) != 2:
            sys.exit("[ERROR] --compare expects exactly 2 inputs: <previs_mute.mp4> <magi2_final.mp4>")
        build_top_bottom_compare(Path(args.inputs[0]), Path(args.inputs[1]), Path(args.output))
    else:
        if len(args.inputs) != 2:
            sys.exit("[ERROR] Previs prep mode expects 2 arguments: <raw_input.mp4> <sanitized_mute_output.mp4>")
        sheet = Path(args.sheet) if args.sheet else None
        prep_previs(
            Path(args.inputs[0]),
            Path(args.inputs[1]),
            width=args.width,
            height=args.height,
            fps=args.fps,
            sheet_out=sheet,
        )


if __name__ == "__main__":
    main()
