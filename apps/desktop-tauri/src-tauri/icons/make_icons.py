#!/usr/bin/env python3
"""Emit real PNG icons (and a PNG-payload .ico) for the Sovereign Portal C-137
desktop shells. Pure standard library (struct + zlib) so it runs on any CPython.

Usage:
    python make_icons.py [extra_512_png_path]

Writes 32x32.png, 128x128.png, 128x128@2x.png, 256x256.png and icon.ico next to
this script. If an argument is supplied an additional 512x512 PNG is written to
that path (used for the Electron build/icon.png).
"""
import os
import struct
import sys
import zlib

# Sovereign Portal C-137 palette
VOID = (2, 11, 5)
GREEN = (0, 255, 136)      # --portal-green #00ff88
CYAN = (0, 229, 255)       # --hud-cyan     #00e5ff
YELLOW = (212, 255, 0)     # --portal-yellow #d4ff00


def _rounded_mask(x, y, size, radius):
    """Return 0.0..1.0 coverage of a rounded square for pixel centre (x, y)."""
    cx = cy = (size - 1) / 2.0
    r = radius
    dx = abs(x - cx)
    dy = abs(y - cy)
    half = size / 2.0
    inner = half - r
    if dx <= inner or dy <= inner:
        return 1.0
    ddx = dx - inner
    ddy = dy - inner
    dist = (ddx * ddx + ddy * ddy) ** 0.5
    if dist <= r:
        return 1.0
    if dist >= r + 1.0:
        return 0.0
    return max(0.0, 1.0 - (dist - r))


def render_rgba(size):
    """Render the portal-gun ring emblem at the requested pixel size."""
    px = bytearray(size * size * 4)
    cx = cy = (size - 1) / 2.0
    maxr = size / 2.0
    radius = size * 0.18
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            d = (dx * dx + dy * dy) ** 0.5
            r = d / maxr

            ring = max(0.0, 1.0 - abs(r - 0.72) / 0.11)
            inner = max(0.0, 1.0 - r / 0.36)
            core = max(0.0, 1.0 - r / 0.16)
            glow = max(0.0, 1.0 - r / 0.95)

            gr = GREEN
            cy_ = CYAN
            ye = YELLOW

            R = VOID[0] + ring * gr[0] * 0.15 + inner * cy_[0] * 0.35 + core * ye[0] * 0.5
            G = VOID[1] + ring * gr[1] + inner * cy_[1] * 0.55 + core * ye[1] * 0.6 + glow * 34 * 0.35
            B = VOID[2] + ring * gr[2] + inner * cy_[2] * 0.75 + core * ye[2] * 0.4

            R = int(min(255.0, R))
            G = int(min(255.0, G))
            B = int(min(255.0, B))

            cov = _rounded_mask(x, y, size, radius)
            if size <= 48:
                # tiny sizes: keep the ring readable, skip the rounded corners
                cov = 1.0
            A = int(round(255 * cov))

            i = (y * size + x) * 4
            px[i] = R
            px[i + 1] = G
            px[i + 2] = B
            px[i + 3] = A
    return bytes(px)


def encode_png(size):
    rgba = render_rgba(size)
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter type 0 (None)
        raw.extend(rgba[y * stride:(y + 1) * stride])

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def write_png(path, size):
    with open(path, "wb") as fh:
        fh.write(encode_png(size))


def write_ico(path, payloads):
    """payloads: list of (size, png_bytes). PNG-compressed ICO container."""
    n = len(payloads)
    header = struct.pack("<HHH", 0, 1, n)
    entries = b""
    blob = b""
    offset = 6 + 16 * n
    for size, png in payloads:
        w = 0 if size >= 256 else size
        h = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(png), offset)
        offset += len(png)
        blob += png
    with open(path, "wb") as fh:
        fh.write(header + entries + blob)


def main():
    icon_dir = os.path.dirname(os.path.abspath(__file__))
    targets = [
        ("32x32.png", 32),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
        ("256x256.png", 256),
        ("icon.png", 512),
    ]
    for name, size in targets:
        write_png(os.path.join(icon_dir, name), size)
        print("wrote", os.path.join(icon_dir, name), size)

    ico_payloads = [(256, encode_png(256)), (128, encode_png(128)), (32, encode_png(32))]
    write_ico(os.path.join(icon_dir, "icon.ico"), ico_payloads)
    print("wrote", os.path.join(icon_dir, "icon.ico"))

    if len(sys.argv) > 1:
        write_png(os.path.abspath(sys.argv[1]), 512)
        print("wrote", os.path.abspath(sys.argv[1]), 512)


if __name__ == "__main__":
    main()
