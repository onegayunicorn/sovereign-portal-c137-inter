"""SOE Sovereign Gateway — FastAPI telemetry + orchestration + VoiceΩ layer.

Exposes:
    POST /telemetry/inject     inject a [TELEMETRY] block / sensor context
    POST /orchestrate/action   run an ORC action (requires X-API-Key)
    GET  /audit/verify         verify the Merkle chain end-to-end
    GET  /health               liveness / coherence probe
    POST /voice/synthesize     VoiceΩ neural TTS (VOX-001)
    POST /voice/podcast        VoiceΩ document-to-podcast mix (VOX-003)
    GET  /                     static mount of the built portal (graceful fallback)

Run:  python gateway.py   ->  http://127.0.0.1:8000
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from rick_persona import build_prompt, parse_telemetry, persona_summary
from soe_core import ORC_CATALOG, SovereignOrchestratorAgent
from voice_omega import VoiceOmegaEngine, attach_to_orchestrator

app = FastAPI(title="SOE Sovereign Gateway", version="1.0.0")
soa = SovereignOrchestratorAgent()
voice_engine: VoiceOmegaEngine = attach_to_orchestrator(soa)

API_KEY_ENV = "SOE_API_KEY"


def resolve_web_root() -> Optional[Path]:
    """Locate the built portal web root, checking (in order):

      1. ``sys._MEIPASS/web``          (PyInstaller frozen bundle)
      2. ``<cwd>/web``                 (portable / dev layout)
      3. ``<cwd>/../../dist/website``  (monorepo build output)
      4. ``<exe dir>/web``             (frozen exe folder fallback)
    """
    candidates: List[Path] = []

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "web")

    cwd = Path.cwd()
    candidates.append(cwd / "web")
    candidates.append(cwd / ".." / ".." / "dist" / "website")

    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / "web")
    else:
        candidates.append(Path(__file__).resolve().parent / "web")

    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved.is_dir():
            return resolved
    return None


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class TelemetryPayload(BaseModel):
    gamma_decoherence: Optional[float] = 0.0
    schumann_coherence: Optional[float] = 0.0
    ricci_drift: Optional[float] = 0.0


class OrchestrationRequest(BaseModel):
    action_id: str
    payload: Dict[str, Any] = {}


class VoiceSynthesizeRequest(BaseModel):
    text: str
    output_file: str = "episode_001.mp3"
    voice: str = "nova"
    backend: str = "openai"


class VoicePodcastRequest(BaseModel):
    script: List[Tuple[str, str]]
    output_file: str = "podcast.wav"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "version": app.version,
        "frozen": soa.frozen,
        "coherence": soa.system_coherence(),
        "coherence_stage": soa.coherence_stage()["stage"],
        "engine_count": len(soa.engines),
        "voice_omega": soa.voice_omega is not None,
        "global_merkle_root": soa.get_global_merkle_root(),
    }


@app.post("/telemetry/inject")
def inject_telemetry(telemetry: TelemetryPayload) -> Dict[str, Any]:
    stage = "NOMINAL"
    if telemetry.gamma_decoherence > 0.06:
        stage = "HIGH_DECOHERENCE"
    elif telemetry.ricci_drift > 0.048:
        stage = "DIMENSIONAL_INSTABILITY"
    elif telemetry.schumann_coherence > 0.8:
        stage = "SCHUMANN_LOCK"
    modifiers = parse_telemetry(
        f"[TELEMETRY] GAMMA_DECOHERENCE={telemetry.gamma_decoherence} "
        f"SCHUMANN_COHERENCE={telemetry.schumann_coherence} "
        f"RICCI_DRIFT={telemetry.ricci_drift} STAGE={stage}"
    )
    return {
        "injection_header": f"[TELEMETRY] STAGE={stage}",
        "stage": stage,
        "modifiers": modifiers,
    }


@app.post("/orchestrate/action")
def orchestrate(req: OrchestrationRequest, x_api_key: str = Header(None)) -> Dict[str, Any]:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing Merkle API key")
    expected = os.getenv(API_KEY_ENV)
    if expected and x_api_key != expected:
        raise HTTPException(status_code=403, detail="Invalid Merkle API key")
    try:
        result = soa.execute_orc(req.action_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    result = dict(result)
    result["request_payload"] = req.payload
    return result


@app.get("/audit/verify")
def verify_chain() -> Dict[str, Any]:
    verification = soa.verify_merkle_chain()
    return {
        "global_merkle_root": soa.get_global_merkle_root(),
        "coherence": 0.99998,
        "status": "CHAIN_VERIFIED" if verification["valid"] else "CHAIN_BROKEN",
        "engine_count": verification["engine_count"],
        "transitions_checked": verification["transitions_checked"],
        "broken": verification["broken"],
    }


@app.post("/voice/synthesize")
def voice_synthesize(req: VoiceSynthesizeRequest) -> Dict[str, Any]:
    try:
        if req.backend == "elevenlabs":
            path = voice_engine.synthesize_elevenlabs(req.text, output_file=req.output_file)
        else:
            path = voice_engine.synthesize(req.text, output_file=req.output_file, voice=req.voice)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "status": "VOX_001_SYNTHESIZED",
        "output_file": path,
        "voice_merkle_root": voice_engine.merkle_root,
        "global_merkle_root": soa.get_global_merkle_root(),
    }


@app.post("/voice/podcast")
def voice_podcast(req: VoicePodcastRequest) -> Dict[str, Any]:
    try:
        path = voice_engine.mix_podcast(req.script, output_file=req.output_file)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "status": "VOX_003_MIXED",
        "output_file": path,
        "voice_merkle_root": voice_engine.merkle_root,
        "global_merkle_root": soa.get_global_merkle_root(),
    }


@app.get("/persona")
def persona() -> Dict[str, Any]:
    return persona_summary()


# ---------------------------------------------------------------------------
# Static portal (mounted last so explicit routes win) with graceful fallback
# ---------------------------------------------------------------------------
WEB_ROOT = resolve_web_root()

if WEB_ROOT is not None:  # pragma: no cover - depends on build output
    app.mount("/", StaticFiles(directory=str(WEB_ROOT), html=True), name="portal")
else:

    @app.get("/", response_class=HTMLResponse)
    def portal_fallback() -> str:
        return (
            "<!DOCTYPE html><html><head><title>Sovereign Portal C-137</title></head>"
            "<body style='background:#020b05;color:#00ff88;font-family:monospace'>"
            "<h1>SOVEREIGN PORTAL C-137</h1>"
            "<p>Gateway online. Built portal assets were not found at the resolved web root.</p>"
            "<ul>"
            "<li>GET /health</li>"
            "<li>GET /audit/verify</li>"
            "<li>POST /orchestrate/action</li>"
            "<li>POST /voice/synthesize</li>"
            "</ul></body></html>"
        )


if __name__ == "__main__":  # pragma: no cover - manual entrypoint
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
