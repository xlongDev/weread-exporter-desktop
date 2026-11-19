#!/usr/bin/env python3
"""生成应用内更新清单 latest.json（tauri-plugin-updater 端点文件）。

用法（发版流程最后一步，见 docs/12 §发布）：
    python3 scripts/make-latest-json.py --tag v0.2.0 --dist-dir dist

从 dist/ 读取：
- macOS：*.app.tar.gz + 同名 .sig（darwin-aarch64 / darwin-x86_64 按 CPU 架构识别）
- Windows：*-setup.exe + 同名 .sig（windows-x86_64）

输出 dist/latest.json，随安装包一并 `gh release upload`。
签名校验在客户端进行（tauri.conf.json 的 pubkey），此脚本不接触私钥。
"""
import argparse
import json
import pathlib
import re
import urllib.parse

REPO = "xlongDev/weread-exporter-desktop"
# 更新端点平台键（Tauri v2 约定：darwin-aarch64 / darwin-x86_64 / windows-x86_64）
PLATFORMS = {
    "darwin-aarch64": ("aarch64", ".app.tar.gz"),
    "darwin-x86_64": ("x86_64", ".app.tar.gz"),
    "windows-x86_64": ("x64", "-setup.exe"),
}


def find_artifact(dist: pathlib.Path, arch: str, suffix: str):
    """按架构与后缀匹配产物；返回 (文件名, 签名内容) 或 None。"""
    for f in sorted(dist.iterdir()):
        name = f.name
        if arch not in name or not name.endswith(suffix) or name.endswith(".sig"):
            continue
        sig = f.with_name(name + ".sig")
        if not sig.is_file():
            continue
        return name, sig.read_text().strip()
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True, help="发布 tag，如 v0.2.0")
    ap.add_argument("--dist-dir", default="dist", help="产物目录（默认 dist）")
    ap.add_argument("--notes", default="", help="更新说明（可选）")
    args = ap.parse_args()

    dist = pathlib.Path(args.dist_dir)
    version = args.tag.lstrip("v")
    platforms = {}
    for plat, (arch, suffix) in PLATFORMS.items():
        hit = find_artifact(dist, arch, suffix)
        if not hit:
            continue
        name, sig = hit
        url = "https://github.com/{repo}/releases/download/{tag}/{name}".format(
            repo=REPO, tag=args.tag, name=urllib.parse.quote(name)
        )
        platforms[plat] = {"signature": sig, "url": url}
        print(f"  {plat}: {name}")

    if not platforms:
        raise SystemExit("❌ dist/ 中未找到任何带 .sig 的更新产物（先完成带签名的构建）")

    out = dist / "latest.json"
    out.write_text(json.dumps(
        {"version": version, "notes": args.notes, "platforms": platforms},
        ensure_ascii=False, indent=2,
    ) + "\n", encoding="utf-8")
    print(f"✅ {out}（version={version}, platforms={list(platforms)}）")


if __name__ == "__main__":
    main()
