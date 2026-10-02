#!/usr/bin/env python3
"""
download_models.py — fetch / verify the quantized sovereign offline-AI weights.

Streams the WebLLM (Llama-3.2-1B-Instruct q4f16) and Whisper-tiny(STT) WebGPU
weights into a local `public/models` directory so the PWA can run fully offline
(air-gap safe). The Service Worker then serves these via CacheStorage range
requests; nginx exposes the directory with `Accept-Ranges: bytes`.

Only the Python standard library is used (urllib + hashlib + argparse).

Usage:
    python tools/download_models.py                        # download into public/models
    python tools/download_models.py --out apps/web-pwa/public/models
    python tools/download_models.py --dry-run              # print the plan only
    python tools/download_models.py --write-manifest-only  # just emit manifest.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request

DEFAULT_OUT = os.path.join("apps", "web-pwa", "public", "models")

# Hugging Face resolve URLs (no auth). `sha256` may be None when unknown.
WEBLLM_BASE = "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/main"
WHISPER_BASE = "https://huggingface.co/Xenova/whisper-tiny.en/resolve/main"

MODEL_MANIFEST = {
    "schema": "sovereign-portal-c137/models-manifest@1",
    "assets": [
        {
            "id": "Llama-3.2-1B-Instruct-q4f16_1-MLC",
            "kind": "webllm",
            "role": "Sovereign offline chat completion (WebGPU)",
            "files": [
                {"path": "Llama-3.2-1B-Instruct-q4f16_1-MLC/mlc-chat-config.json",
                 "url": f"{WEBLLM_BASE}/mlc-chat-config.json", "sha256": None},
                {"path": "Llama-3.2-1B-Instruct-q4f16_1-MLC/tokenizer.json",
                 "url": f"{WEBLLM_BASE}/tokenizer.json", "sha256": None},
                {"path": "Llama-3.2-1B-Instruct-q4f16_1-MLC/params_shard_0.bin",
                 "url": f"{WEBLLM_BASE}/params_shard_0.bin", "sha256": None},
                {"path": "Llama-3.2-1B-Instruct-q4f16_1-ctx4k_webgpu.wasm",
                 "url": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/"
                        "Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm", "sha256": None},
            ],
        },
        {
            "id": "whisper-tiny-en",
            "kind": "whisper",
            "role": "Offline speech-to-text (WebGPU / WASM)",
            "files": [
                {"path": "whisper-tiny-en/config.json",
                 "url": f"{WHISPER_BASE}/config.json", "sha256": None},
                {"path": "whisper-tiny-en/tokenizer.json",
                 "url": f"{WHISPER_BASE}/tokenizer.json", "sha256": None},
                {"path": "whisper-tiny-en/onnx/encoder_model_quantized.onnx",
                 "url": f"{WHISPER_BASE}/onnx/encoder_model_quantized.onnx", "sha256": None},
                {"path": "whisper-tiny-en/onnx/decoder_model_merged_quantized.onnx",
                 "url": f"{WHISPER_BASE}/onnx/decoder_model_merged_quantized.onnx", "sha256": None},
            ],
        },
    ],
}


def sha256_file(path: str, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def stream_download(url: str, dest: str) -> int:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": "sovereign-portal-c137/1.0"})
    total = 0
    with urllib.request.urlopen(req, timeout=60) as resp, open(tmp, "wb") as out:
        while True:
            piece = resp.read(1 << 20)
            if not piece:
                break
            out.write(piece)
            total += len(piece)
    os.replace(tmp, dest)
    return total


def main() -> int:
    ap = argparse.ArgumentParser(description="Download sovereign offline-AI model weights.")
    ap.add_argument("--out", default=DEFAULT_OUT, help="target models directory")
    ap.add_argument("--dry-run", action="store_true", help="print the plan, download nothing")
    ap.add_argument("--write-manifest-only", action="store_true", help="only emit manifest.json")
    args = ap.parse_args()

    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    print(f"[download_models] target: {out_dir}")

    if args.dry_run:
        for asset in MODEL_MANIFEST["assets"]:
            print(f"  [{asset['kind']}] {asset['id']} — {asset['role']}")
            for f in asset["files"]:
                print(f"      -> {f['path']}")
        print("[download_models] dry-run complete (nothing downloaded).")
        return 0

    failures = []
    if not args.write_manifest_only:
        for asset in MODEL_MANIFEST["assets"]:
            print(f"  [{asset['kind']}] {asset['id']}")
            for f in asset["files"]:
                dest = os.path.join(out_dir, f["path"])
                if os.path.exists(dest):
                    size = os.path.getsize(dest)
                    print(f"      = {f['path']} (exists, {size:,d} bytes)")
                    continue
                try:
                    written = stream_download(f["url"], dest)
                    print(f"      + {f['path']} ({written:,d} bytes)")
                except Exception as exc:  # network is optional for air-gapped builds
                    failures.append((f["path"], str(exc)))
                    print(f"      ! {f['path']} FAILED: {exc}", file=sys.stderr)

    manifest_path = os.path.join(out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(MODEL_MANIFEST, fh, indent=2)
    print(f"  wrote {manifest_path}")

    if failures:
        print(f"[download_models] {len(failures)} asset(s) unavailable — "
              f"re-run online, or copy weights manually into {out_dir}.", file=sys.stderr)
        return 1

    print("[download_models] done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
