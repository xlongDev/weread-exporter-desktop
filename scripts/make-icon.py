#!/usr/bin/env python3
"""生成应用图标：纸色圆角底 + 三根书脊（右一根为数据蓝），与设计系统空态插画同语言。
纯标准库实现（无 Pillow）：4x 超采样光栅化 → PNG → sips 缩放 → iconutil 出 icns。
产物覆盖 apps/desktop/src-tauri/icons/（文件名保持 tauri.conf.json 引用不变）。
"""
import math
import os
import struct
import subprocess
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "apps", "desktop", "src-tauri", "icons")
MASTER = 1024
SS = 4  # 超采样倍数

GROUND = (0xF4, 0xF3, 0xF1, 0xFF)
RAISED = (0xE3, 0xE1, 0xDD, 0xFF)
INK = (0x25, 0x24, 0x22, 0xFF)
DATA = (0x1D, 0x5F, 0xBF, 0xFF)


def rounded_rect_mask(x, y, w, h, r, W, H):
    """返回 alpha(x, y) ∈ [0,1] 的圆角矩形覆盖（超采样坐标）"""
    inside = 1.0
    if x < 0 or y < 0 or x >= W or y >= H:
        return 0.0
    rx, ry = x - w / 2.0, y - h / 2.0  # 以中心为原点
    ax, ay = abs(rx), abs(ry)
    hx, hy = w / 2.0, h / 2.0
    corner_r = r
    if ax > hx - corner_r and ay > hy - corner_r:
        dx = ax - (hx - corner_r)
        dy = ay - (hy - corner_r)
        d = math.hypot(dx, dy)
        inside = max(0.0, min(1.0, corner_r - d + 0.5))
    return inside


def render(size):
    W = H = size * SS
    buf = bytearray(W * H * 4)
    m = size * SS
    radius = int(m * 0.215)  # macOS squircle 近似

    def put(i, c, a):
        buf[i] = (buf[i] * (255 - a) + c[0] * a) // 255
        buf[i + 1] = (buf[i + 1] * (255 - a) + c[1] * a) // 255
        buf[i + 2] = (buf[i + 2] * (255 - a) + c[2] * a) // 255
        buf[i + 3] = (buf[i + 3] * (255 - a) + 255 * a) // 255

    # 书脊矩形（中心坐标，超采样单位）
    spine_w = int(m * 0.115)
    spine_h = int(m * 0.46)
    cy = m / 2
    spines = [
        (m * 0.300, cy - m * 0.010, RAISED),
        (m * 0.470, cy + m * 0.045, INK),
        (m * 0.640, cy - m * 0.010, DATA),
    ]

    for y in range(H):
        row = y * W * 4
        # 背景圆角方块
        bg_a = rounded_rect_mask(0, 0, m, m, radius, W, H) if 0 <= y < H else 0
        for x in range(W):
            i = row + x * 4
            a = int(rounded_rect_mask(x, y, m, m, radius, W, H) * 255)
            if a == 0:
                continue
            put(i, GROUND[:3], a) if False else None
            # 手动混合（背景不透明）
            f = a / 255.0
            buf[i] = int(GROUND[0] * f)
            buf[i + 1] = int(GROUND[1] * f)
            buf[i + 2] = int(GROUND[2] * f)
            buf[i + 3] = 255
            # 书脊
            for (sx, sy, col) in spines:
                x0 = sx - spine_w / 2
                x1 = sx + spine_w / 2
                y0 = sy - spine_h / 2
                y1 = sy + spine_h / 2
                if x0 <= x < x1 and y0 <= y < y1:
                    # 书脊内 2px 圆角近似：略去，直角即可（小元素）
                    t = 1.0
                    buf[i] = int(buf[i] * (1 - t) + col[0] * t)
                    buf[i + 1] = int(buf[i + 1] * (1 - t) + col[1] * t)
                    buf[i + 2] = int(buf[i + 2] * (1 - t) + col[2] * t)
    # 降采样（box filter）
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for dy in range(SS):
                for dx in range(SS):
                    idx = ((y * SS + dy) * W + (x * SS + dx)) * 4
                    r += buf[idx]
                    g += buf[idx + 1]
                    b += buf[idx + 2]
                    a += buf[idx + 3]
            n = SS * SS
            o = (y * size + x) * 4
            out[o], out[o + 1], out[o + 2], out[o + 3] = r // n, g // n, b // n, a // n
    return bytes(out)


def write_png(path, size, rgba):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + rgba[y * size * 4:(y + 1) * size * 4] for y in range(size))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(ICONS, exist_ok=True)
    master_png = os.path.join(ICONS, "icon-master-1024.png")
    write_png(master_png, MASTER, render(MASTER))
    print("master rendered")

    # iconset → icns
    iconset = os.path.join(ICONS, "icon.iconset")
    os.makedirs(iconset, exist_ok=True)
    sizes = [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)]
    for base, scale in sizes:
        px = base * scale
        out = os.path.join(iconset, f"icon_{base}x{base}{'' if scale == 1 else '@2x'}.png")
        subprocess.run(["sips", "-z", str(px), str(px), master_png, "--out", out],
                       check=True, capture_output=True)
    icns = os.path.join(ICONS, "icon.icns")
    subprocess.run(["iconutil", "-c", "icns", iconset, "-o", icns], check=True)

    # tauri 引用的其余位图
    for name, px in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 512),
                     ("Square107x107Logo.png", 107), ("Square142x142Logo.png", 142), ("Square150x150Logo.png", 150),
                     ("Square284x284Logo.png", 284), ("Square30x30Logo.png", 30), ("Square310x310Logo.png", 310),
                     ("Square44x44Logo.png", 44), ("Square71x71Logo.png", 71), ("Square89x89Logo.png", 89),
                     ("StoreLogo.png", 50)]:
        subprocess.run(["sips", "-z", str(px), str(px), master_png, "--out", os.path.join(ICONS, name)],
                       check=True, capture_output=True)

    # ICO（Windows：内嵌 PNG 的现代 ICO）
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    imgs = []
    for px in ico_sizes:
        tmp = os.path.join(ICONS, f"_ico_{px}.png")
        subprocess.run(["sips", "-z", str(px), str(px), master_png, "--out", tmp],
                       check=True, capture_output=True)
        imgs.append((px, open(tmp, "rb").read()))
        os.remove(tmp)
    header = struct.pack("<HHH", 0, 1, len(imgs))
    offset = 6 + 16 * len(imgs)
    entries = b""
    body = b""
    for px, data in imgs:
        b = 0 if px >= 256 else px
        entries += struct.pack("<BBBBHHII", b, b, 0, 0, 1, 32, len(data), offset)
        body += data
        offset += len(data)
    with open(os.path.join(ICONS, "icon.ico"), "wb") as f:
        f.write(header + entries + body)

    os.remove(master_png)
    subprocess.run(["rm", "-rf", iconset])
    print("icons written:", ICONS)


if __name__ == "__main__":
    sys.exit(main())
