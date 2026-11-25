#!/usr/bin/env python3
"""
LibTV Remote MCP Setup & Adapter Fix for Antigravity (plus Claude Code / Codex helpers)
=======================================================================================
Fixes common issues connecting LibTV Remote MCP (https://mcp.liblib.tv/mcp) inside
Antigravity and other desktop stdio MCP hosts:
  1. Creates ~/.gemini/config/plugins/libtv/{plugin.json, mcp_config.json, assets/libtv-icon.svg}
  2. Resolves absolute `npx` binary path + clean PATH so GUI apps don't fail with ENOENT
  3. Sets `timeoutSeconds: 1200` (20 min) so 10-30s MAGI-2 video renders don't get cut off
  4. Optionally configures `NODE_USE_ENV_PROXY=1` + proxy URL when behind an HTTP(S) proxy

Zero third-party dependencies (Python 3.9+ standard library only).
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import sys
from pathlib import Path

LIBTV_MCP_URL = "https://mcp.liblib.tv/mcp"

LIBTV_ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 48 48" fill="none">
  <rect width="48" height="48" rx="10" fill="#000" />
  <g transform="translate(11.397 15.692)" fill="#fff">
    <path d="M16.5757 16.616H0L0.832729 12.1982H17.6504L16.5757 16.616Z" />
    <path d="M0 16.616L2.31411 4.34598H6.76176L4.4459 16.616H0Z" />
    <path d="M8.26945 0H25.2063L24.3736 4.41609H7.54366L8.26945 0Z" />
    <path d="M25.2062 0L22.8921 12.27L18.3796 12.2718L20.7604 0H25.2062Z" />
  </g>
</svg>
"""


def find_npx() -> str:
    """Locate npx executable across PATH and common macOS/Linux/Windows locations."""
    found = shutil.which("npx")
    if found:
        return str(Path(found).resolve())

    home = Path.home()
    candidates = [
        Path("/opt/homebrew/bin/npx"),
        Path("/usr/local/bin/npx"),
        Path("/usr/bin/npx"),
        home / ".volta" / "bin" / "npx",
        home / ".fnm" / "current" / "bin" / "npx",
    ]
    # Check nvm installations if present
    nvm_dir = home / ".nvm" / "versions" / "node"
    if nvm_dir.is_dir():
        for node_ver in sorted(nvm_dir.iterdir(), reverse=True):
            candidates.insert(0, node_ver / "bin" / "npx")

    for cand in candidates:
        if cand.is_file() and os.access(cand, os.X_OK):
            return str(cand)

    return "npx.cmd" if platform.system() == "Windows" else "npx"


def build_clean_path(npx_path: str) -> str:
    """Construct a reliable PATH for GUI-launched MCP hosts."""
    npx_dir = str(Path(npx_path).parent)
    if platform.system() == "Windows":
        base_dirs = [npx_dir]
        sys_path = os.environ.get("PATH", "")
        return os.pathsep.join([d for d in base_dirs + [sys_path] if d])

    standard_dirs = [
        npx_dir,
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
    ]
    deduped: list[str] = []
    for d in standard_dirs:
        if d and d not in deduped:
            deduped.append(d)
    return ":".join(deduped)


def detect_proxy(args: argparse.Namespace) -> str | None:
    if args.no_proxy:
        return None
    if args.proxy:
        return args.proxy.strip()
    for key in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        val = os.environ.get(key, "").strip()
        if val:
            return val
    return None


def build_plugin_json() -> dict:
    return {
        "name": "libtv",
        "displayName": "LibTV",
        "version": "1.0.0",
        "description": "LibTV 视觉创作插件：连接 LibTV Remote MCP，调用 MAGI-2 与 Seedream 生成视频与透明底素材、编排多模态画布节点。",
        "author": {
            "name": "LiblibAI",
            "url": "https://www.liblib.tv",
        },
        "homepage": "https://www.liblib.tv",
        "repository": "https://github.com/liblib-ai/marketplace",
        "logo": "assets/libtv-icon.svg",
        "suggestedPrompts": [
            "查看我在 LibTV 中的项目和可用视频模型",
            "用 MAGI-2 全能参考模式结合画布节点生成一段 10 秒视频",
            "用 Video to Code 流程生成一段转场参考视频并制作一镜到底产品官网",
        ],
    }


def build_mcp_config(npx_cmd: str, clean_path: str, proxy_url: str | None, timeout_sec: int) -> dict:
    env: dict[str, str] = {
        "PATH": clean_path,
    }
    if proxy_url:
        env["NODE_USE_ENV_PROXY"] = "1"
        env["HTTPS_PROXY"] = proxy_url
        env["HTTP_PROXY"] = proxy_url

    return {
        "mcpServers": {
            "libtv": {
                "command": npx_cmd,
                "args": [
                    "-y",
                    "mcp-remote",
                    LIBTV_MCP_URL,
                ],
                "env": env,
                "timeoutSeconds": timeout_sec,
            }
        }
    }


def print_other_clients() -> None:
    print("\n=== Claude Code 接入命令 ===")
    print(f"claude mcp add --transport http libtv {LIBTV_MCP_URL}")
    print("\n=== Codex 接入命令 ===")
    print(f"codex mcp add libtv --url {LIBTV_MCP_URL}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Install or repair the LibTV Remote MCP plugin for Antigravity."
    )
    p.add_argument(
        "--plugin-dir",
        default=str(Path.home() / ".gemini" / "config" / "plugins" / "libtv"),
        help="Target Antigravity plugin directory (default: ~/.gemini/config/plugins/libtv)",
    )
    p.add_argument(
        "--proxy",
        default=None,
        help="Explicit HTTP(S) proxy URL, e.g. http://127.0.0.1:7890",
    )
    p.add_argument(
        "--no-proxy",
        action="store_true",
        help="Do not inject HTTP_PROXY / HTTPS_PROXY even if set in current shell",
    )
    p.add_argument(
        "--timeout",
        type=int,
        default=1200,
        help="MCP tool timeout in seconds for long video renders (default: 1200)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print generated JSON configs without writing files to disk",
    )
    p.add_argument(
        "--print-other-clients",
        action="store_true",
        help="Also print setup commands for Claude Code and Codex",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    npx_cmd = find_npx()
    if npx_cmd in ("npx", "npx.cmd") and not shutil.which(npx_cmd):
        print(
            "[WARN] Could not find `npx` on this machine. Please install Node.js 18+ (https://nodejs.org) first.",
            file=sys.stderr,
        )

    clean_path = build_clean_path(npx_cmd)
    proxy_url = detect_proxy(args)
    plugin_manifest = build_plugin_json()
    mcp_cfg = build_mcp_config(npx_cmd, clean_path, proxy_url, args.timeout)

    target_dir = Path(args.plugin_dir).expanduser()

    if args.dry_run:
        print(f"--- [DRY RUN] Target directory: {target_dir} ---")
        print("\n# plugin.json")
        print(json.dumps(plugin_manifest, ensure_ascii=False, indent=2))
        print("\n# mcp_config.json")
        print(json.dumps(mcp_cfg, ensure_ascii=False, indent=2))
        if args.print_other_clients:
            print_other_clients()
        return

    assets_dir = target_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    mcp_cfg_path = target_dir / "mcp_config.json"
    if mcp_cfg_path.exists():
        backup_path = target_dir / "mcp_config.json.bak"
        shutil.copy2(mcp_cfg_path, backup_path)
        print(f"[INFO] Backed up existing mcp_config.json -> {backup_path}")

    (target_dir / "plugin.json").write_text(
        json.dumps(plugin_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    mcp_cfg_path.write_text(
        json.dumps(mcp_cfg, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (assets_dir / "libtv-icon.svg").write_text(LIBTV_ICON_SVG, encoding="utf-8")

    print(f"[OK] LibTV Antigravity plugin installed at: {target_dir}")
    print(f"     npx command : {npx_cmd}")
    print(f"     timeout     : {args.timeout}s")
    print(f"     proxy       : {proxy_url or 'direct (no proxy)'}")
    print("\nNext step: Refresh MCP servers in Antigravity and run `libtv` -> `doctor` or `list_projects` to sign in.")

    if args.print_other_clients:
        print_other_clients()


if __name__ == "__main__":
    main()
