#!/usr/bin/env python3
"""
make_icons.py — Sovereign Portal C-137 icon generator.

Pure-Python PNG writer (NO external image libraries: only stdlib zlib + struct).
Renders a green portal-vortex ring on a dark void background and writes:

    icon-192.png      192x192  (PWA 'any' icon)
    icon-512.png      512x512  (PWA 'any' icon)
    maskable-512.png  512x512  (PWA 'maskable' icon, safe-zone padded)
    icon.svg          vector portal-vortex ring

Usage:
    python tools/make_icons.py --out apps/web-portal/icons
    python tools/make_icons.py --out <temp dir>
"""

from __future__ import annotations

import argparse
import math
import os
import struct
import zlib

# --- Portal C-137 palette -----------------------------------------------------
VOID = (0x02, 0x0B, 0x05)          # --portal-void #020b05
PORTAL_GREEN = (0x00, 0xFF, 0x88)  # --portal-green #00ff88
PORTAL_YELLOW = (0xD4, 0xFF, 0x00) # --portal-yellow #d4ff00
HUD_CYAN = (0x00, 0xE5, 0xFF)      # --hud-cyan #00e5ff


def _mix(a, b, t: float):
    t = max(0.0, min(1.0, t))
    return (
        int(a[0] + (b[0] - a[0]) * t),
        int(a[1] + (b[1] - a[1]) * t),
        int(a[2] + (b[2] - a[2]) * t),
    )


def _clamp8(v: float) -> int:
    return 0 if v < 0 else (255 if v > 255 else int(v))


def render_rgba(size: int, ring_radius: float = 0.34, maskable: bool = False) -> bytearray:
    """Render the portal-vortex ring and return flat RGBA bytes (len = size*size*4)."""
    buf = bytearray(size * size * 4)
    inv = 1.0 / size
    core = 0.0 if maskable else 0.0

    for y in range(size):
        ny = (y + 0.5) * inv * 2.0 - 1.0
        for x in range(size):
            nx = (x + 0.5) * inv * 2.0 - 1.0

            dist = math.hypot(nx, ny)
            angle = math.atan2(ny, nx)

            # --- Base void with a soft radial nebula -----------------------
            nebula = max(0.0, 1.0 - dist) * 0.10
            r = VOID[0] + PORTAL_GREEN[0] * nebula
            g = VOID[1] + PORTAL_GREEN[1] * nebula
            b = VOID[2] + PORTAL_GREEN[2] * nebula

            # --- Vortex ring (spiral-modulated gaussian band) --------------
            spiral = math.sin(angle * 3.0 + dist * 9.0) * 0.5 + 0.5
            rr = ring_radius + 0.018 * math.sin(angle * 3.0 + core)
            delta = abs(dist - rr)
            band = math.exp(-((delta / 0.052) ** 2))
            ring_intensity = band * (0.82 + 0.18 * spiral)

            # Hot inner core of the ring leans toward portal yellow.
            tint = _mix(PORTAL_GREEN, PORTAL_YELLOW, spiral * 0.65)

            r += tint[0] * ring_intensity
            g += tint[1] * ring_intensity
            b += tint[2] * ring_intensity

            # --- Accretion glow + center singularity -----------------------
            glow = math.exp(-dist * 3.2) * 0.30
            r += PORTAL_GREEN[0] * glow
            g += PORTAL_GREEN[1] * glow
            b += PORTAL_GREEN[2] * glow

            center = math.exp(-(dist / 0.085) ** 2) * 0.85
            r += HUD_CYAN[0] * center * 0.35 + PORTAL_YELLOW[0] * center * 0.65
            g += HUD_CYAN[1] * center * 0.35 + PORTAL_YELLOW[1] * center * 0.65
            b += HUD_CYAN[2] * center * 0.35 + PORTAL_YELLOW[2] * center * 0.65

            i = (y * size + x) * 4
            buf[i + 0] = _clamp8(r)
            buf[i + 1] = _clamp8(g)
            buf[i + 2] = _clamp8(b)
            buf[i + 3] = 255
    return buf


def _chunk(ctype: bytes, data: bytes) -> bytes:
    body = ctype + data
    return (
        struct.pack(">I", len(data))
        + body
        + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    )


def png_bytes(width: int, height: int, rgba: bytes) -> bytes:
    """Encode flat RGBA bytes as a valid 8-bit RGBA PNG (colour type 6)."""
    stride = width * 4
    raw = bytearray((stride + 1) * height)
    pos = 0
    for y in range(height):
        raw[pos] = 0  # filter type: None
        pos += 1
        start = y * stride
        raw[pos:pos + stride] = rgba[start:start + stride]
        pos += stride

    compressed = zlib.compress(bytes(raw), 9)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)

    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", compressed)
        + _chunk(b"IEND", b"")
    )


def write_png(path: str, size: int, maskable: bool = False) -> int:
    # Maskable icons must keep their content inside the central 80% safe zone,
    # so the vortex ring is pulled inward (and slightly shrunk) for that variant.
    ring_radius = 0.26 if maskable else 0.34
    rgba = render_rgba(size, ring_radius=ring_radius, maskable=maskable)
    data = png_bytes(size, size, rgba)
    with open(path, "wb") as fh:
        fh.write(data)
    return len(data)


ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Sovereign Portal C-137">
  <defs>
    <radialGradient id="void" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#04140a"/>
      <stop offset="100%" stop-color="#020b05"/>
    </radialGradient>
    <radialGradient id="core" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#d4ff00" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="#00ff88" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#00ff88" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00ff88"/>
      <stop offset="55%" stop-color="#d4ff00"/>
      <stop offset="100%" stop-color="#00e5ff"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="512" height="512" fill="url(#void)"/>
  <circle cx="256" cy="256" r="180" fill="url(#core)"/>

  <g filter="url(#glow)" fill="none" stroke="url(#ring)">
    <circle cx="256" cy="256" r="174" stroke-width="16"/>
    <circle cx="256" cy="256" r="140" stroke-width="6" stroke-opacity="0.65"/>
    <ellipse cx="256" cy="256" rx="174" ry="70" stroke-width="4" stroke-opacity="0.45"/>
    <ellipse cx="256" cy="256" rx="70" ry="174" stroke-width="4" stroke-opacity="0.45"/>
  </g>

  <circle cx="256" cy="256" r="26" fill="#d4ff00" opacity="0.9"/>
</svg>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Sovereign Portal C-137 icons.")
    parser.add_argument("--out", default="apps/web-portal/icons", help="output directory")
    args = parser.parse_args()

    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("maskable-512.png", 512, True),
    ]

    print(f"[make_icons] writing to {out_dir}")
    for name, size, maskable in targets:
        path = os.path.join(out_dir, name)
        written = write_png(path, size, maskable=maskable)
        print(f"  {name:<18} {size}x{size}  {written:>8,d} bytes")

    svg_path = os.path.join(out_dir, "icon.svg")
    with open(svg_path, "w", encoding="utf-8") as fh:
        fh.write(ICON_SVG)
    print(f"  {'icon.svg':<18} vector     {os.path.getsize(svg_path):>8,d} bytes")

    print("[make_icons] done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
