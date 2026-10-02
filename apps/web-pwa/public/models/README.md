# `/public/models` — sovereign weight drop zone

Everything in this directory is shipped verbatim to `dist/models/` and served by
the hardened range-request service worker (`public/sw.js`). Nothing here is ever
fetched from a CDN at runtime — the portal is air-gap safe by design.

## 1. WebGPU LLM (MLC / WebLLM)

Create one folder per model id; the app requests exactly these paths:

```
public/models/
└── Llama-3.2-1B-Instruct-q4f16_1-MLC/
    ├── mlc-chat-config.json
    ├── tensor-cache.json
    └── params_shard_*.bin
public/models/
└── Llama-3.2-1B-Instruct-q4f16_1-ctx4k_webgpu.wasm
```

`SovereignAIEngine` defaults (see `packages/offline-ai/src/web-llm-engine.ts`):

| Constant | Value |
| --- | --- |
| `DEFAULT_MODEL_ID` | `Llama-3.2-1B-Instruct-q4f16_1-MLC` |
| `model_url` | `/models/Llama-3.2-1B-Instruct-q4f16_1-MLC/` |
| `model_lib_url` | `/models/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_webgpu.wasm` |
| `required_features` | `["shader-f16"]` |

### How to produce them

```bash
# MLC weights
python -m mlc_llm convert_weight ./models/Llama-3.2-1B-Instruct \
  --quantization q4f16_1 \
  -o ./apps/web-pwa/public/models/Llama-3.2-1B-Instruct-q4f16_1-MLC

# Compiled WebGPU library for the ctx4k window
python -m mlc_llm compile ./dist/Llama-3.2-1B-Instruct-q4f16_1-MLC/mlc-chat-config.json \
  --device webgpu \
  -o ./apps/web-pwa/public/models/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_webgpu.wasm
```

The optional light-weight fallback model id is
`SmolLM2-360M-Instruct-q4f16_1-MLC`, referenced as `FALLBACK_MODEL_ID`.

## 2. Whisper STT (Transformers.js)

`SovereignWhisper` runs `whisper-tiny-en` with `env.allowRemoteModels = false`
and `env.localModelPath = '/models/'`, quantized ONNX, device `webgpu`
(automatic WASM fallback):

```
public/models/
└── whisper-tiny-en/
    ├── config.json
    ├── tokenizer.json
    ├── tokenizer_config.json
    ├── preprocessor_config.json
    ├── generation_config.json
    └── onnx/
        ├── encoder_model_quantized.onnx
        └── decoder_model_merged_quantized.onnx
```

## 3. Kokoro / Piper TTS

`SovereignTts` looks here for the neural voice. If the files are absent the
class degrades silently to the browser `SpeechSynthesis` API — the orchestrator
never loses its voice offline.

```
public/models/
└── kokoro-82m/
    ├── config.json
    ├── tokenizer.json
    └── onnx/model_quantized.onnx
```

## 4. 3D assets

```
public/models/rick_portal_gun.glb
```

`PortalGunModel` probes this path with a `HEAD` request. When it is missing the
component renders a fully procedural portal-gun stand-in instead — no blank
canvas, no console 404 storm.

## Notes

- `sw.js` caches anything under `/models/` in `portal-models-cache` and answers
  `Range: bytes=start-end` requests by slicing the cached `Blob` (HTTP 206).
- Call `navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_MODEL_CACHE' })`
  to reclaim storage after upgrading weights.
- Deployment headers (`vercel.json`, `netlify.toml`) already set
  `Cache-Control: public, max-age=31536000, immutable` and `Accept-Ranges: bytes`.
- These files are large (50 MB – 1.5 GB). Keep them out of Git LFS-less commits;
  `tools/download_models.py` (owned by another workspace) is the intended fetcher.
