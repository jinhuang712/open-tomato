#!/usr/bin/env python3
"""从 assets/logo-raw.png 生成各用途 logo。

用法：python3 assets/build-logo.py
产出：assets/logo/*.png、packages/desktop/build/icon.png、packages/desktop/build/icon.icns
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "assets" / "logo-raw.png"
OUT = ROOT / "assets" / "logo"
DESKTOP_BUILD = ROOT / "packages" / "desktop" / "build"

BG_TOLERANCE = 40  # 与四角背景色的通道差阈值
SIZES = (1024, 512, 256, 128, 64, 32, 16)


def remove_background(im: Image.Image) -> Image.Image:
    """从四边 flood fill 掉与角点同色的背景，罐头内部同色高光保留。"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def is_bg(p):
        return all(abs(p[i] - bg[i]) <= BG_TOLERANCE for i in range(3))

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        if x > 0:
            q.append((x - 1, y))
        if x < w - 1:
            q.append((x + 1, y))
        if y > 0:
            q.append((x, y - 1))
        if y < h - 1:
            q.append((x, y + 1))
    return im


def crop_square(im: Image.Image, pad_ratio: float = 0.06) -> Image.Image:
    """按非透明像素裁剪，再补成正方形并留边。"""
    bbox = im.getbbox()
    im = im.crop(bbox)
    side = int(max(im.size) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas


def resize(im: Image.Image, size: int) -> Image.Image:
    # 像素画：缩小用 LANCZOS 保色，放大用 NEAREST 保硬边
    method = Image.NEAREST if size >= im.width else Image.LANCZOS
    return im.resize((size, size), method)


def rounded_square(size: int, color: tuple[int, int, int], radius_ratio: float = 0.2237) -> Image.Image:
    """macOS 风格圆角方底（半径比例取 Apple 图标模板值）。"""
    scale = 4
    big = size * scale
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * radius_ratio), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    bg = Image.new("RGBA", (size, size), color + (255,))
    bg.putalpha(mask)
    return bg


def app_icon(logo: Image.Image, size: int, bg_color: tuple[int, int, int]) -> Image.Image:
    """macOS 应用图标：图标本体占 1024 画布中间 824px，四周留 100px 透明边。"""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    plate = int(size * 824 / 1024)
    offset = (size - plate) // 2
    canvas.alpha_composite(rounded_square(plate, bg_color), (offset, offset))
    mark = resize(logo, int(plate * 0.78))
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas


def make_icns(png_1024: Path, dest: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()
        src = Image.open(png_1024)
        for s in (16, 32, 128, 256, 512):
            src.resize((s, s), Image.LANCZOS).save(iconset / f"icon_{s}x{s}.png")
            src.resize((s * 2, s * 2), Image.LANCZOS).save(iconset / f"icon_{s}x{s}@2x.png")
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(dest)], check=True)


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    DESKTOP_BUILD.mkdir(parents=True, exist_ok=True)

    raw = Image.open(RAW)
    bg_color = tuple(raw.convert("RGB").getpixel((0, 0)))
    logo = crop_square(remove_background(raw))
    logo_1024 = resize(logo, 1024)

    # 1. 透明底 logo，多尺寸
    for s in SIZES:
        resize(logo_1024, s).save(OUT / f"logo-{s}.png")
    logo_1024.save(OUT / "logo.png")

    # 2. 原粉底方形版（README / 社交卡片用）
    on_bg = Image.new("RGBA", (1024, 1024), bg_color + (255,))
    on_bg.alpha_composite(resize(logo_1024, 820), (102, 102))
    on_bg.convert("RGB").save(OUT / "logo-square-bg.png")

    # 3. macOS 应用图标（粉底圆角方 + 透明留边）
    icon = app_icon(logo_1024, 1024, bg_color)
    icon.save(OUT / "app-icon.png")
    for s in (512, 256, 128, 64, 32, 16):
        icon.resize((s, s), Image.LANCZOS).save(OUT / f"app-icon-{s}.png")

    # 4. 喂给 electron-builder
    icon.save(DESKTOP_BUILD / "icon.png")
    make_icns(OUT / "app-icon.png", DESKTOP_BUILD / "icon.icns")

    # 5. favicon
    icon.resize((64, 64), Image.LANCZOS).save(
        OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]
    )

    for p in sorted(OUT.iterdir()):
        print(p.relative_to(ROOT), p.stat().st_size)


if __name__ == "__main__":
    main()
