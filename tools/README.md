# tools/ — Sovereign Portal C-137 build utilities

Pure-stdlib Python tooling for generating the portal's static assets and model cache.

| Tool | Purpose |
| :--- | :--- |
| `make_icons.py` | Generates `icon-192.png`, `icon-512.png`, `maskable-512.png` and `icon.svg` — a green portal-vortex ring on the `#020b05` void. Pure Python PNG writer (`zlib` + `struct`), **no external image libraries**. |
| `download_models.py` | Streams / verifies the quantized WebLLM (Llama-3.2-1B q4f16) and Whisper-tiny ONNX weights into `public/models` for fully offline inference. |

> `paf_builder.py` (PortableApps PAF packaging) and `build_apk.py` (native Android APK build)
> are owned by other components and are intentionally **not** defined here.

## Usage

```bash
# Icons -> default PWA icon directory
python tools/make_icons.py --out apps/web-portal/icons

# Icons -> an arbitrary directory
python tools/make_icons.py --out /tmp/c137-icons

# Model cache
python tools/download_models.py --out apps/web-pwa/public/models
python tools/download_models.py --dry-run            # show the plan only
python tools/download_models.py --write-manifest-only
```

## Verifying generated icons

```bash
python - <<'PY'
import struct, pathlib
for p in pathlib.Path("apps/web-portal/icons").glob("*.png"):
    b = p.read_bytes()
    assert b[:8] == b"\x89PNG\r\n\x1a\n", "bad PNG signature"
    w, h = struct.unpack(">II", b[16:24])
    print(p.name, f"{w}x{h}", len(b), "bytes")
PY
```

## Notes

- Icons are deterministic: the renderer is fully procedural (no RNG), so byte output is stable across runs.
- `maskable-512.png` keeps the vortex within the central 80% safe zone so launchers can
  crop to any mask shape without clipping the ring.
- The downloaded model weights are large (hundreds of MB). They are git-ignored; the
  `manifest.json` emitted alongside them documents every expected file and its role.
