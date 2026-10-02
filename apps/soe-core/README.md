# Sovereign Orchestrator Engine (`apps/soe-core`)

Python backend for **Sovereign Portal C-137** — the 12-engine Merkle-chained
Sovereign Orchestrator Engine (SOE), the FastAPI gateway, the Rick C-137 persona
runtime and the VoiceΩ voice-synchronisation subsystem.

```
soe-core/
├── soe_core.py            # 11 SOE engines + Merkle DAG + ORC / GOV catalogue
├── voice_omega.py         # VoiceΩ (12th engine): phase vocoder, pitch/formant, podcast
├── rick_persona.py        # Sovereign system instruction + [TELEMETRY] parser + prosody
├── gateway.py             # FastAPI telemetry / orchestration / voice gateway
├── desktop_launcher.py    # entrypoint frozen into SovereignPortalC137.exe
├── run_audit.py           # CLI: ORC-001 audit -> sovereign_audit_results.json
├── Modelfile.rick-c137    # Ollama Modelfile with the full persona embedded
├── requirements.txt
└── tests/                 # test_sovereignty.py, test_voice_omega.py, test_gateway.py (+ conftest.py)
```

## Core invariants

1. **Zero External Dependency Protocol** — the SOE core + VoiceΩ DSP use `numpy` and the standard library only. Heavy packages (librosa, openai, PyPDF2, python-docx, gtts) are imported lazily and raise a clear `RuntimeError` when absent.
2. **Deterministic Merkle Chaining** — every mutation records `(timestamp, engine_id, action_id, state_hash, parent_merkle_root)` as a SHA-256 `MerkleNode`.
3. **Coherence Hard-Stop** — any engine below Γ < 0.999 triggers `GOV-001` (recalibration); below 0.95 triggers `GOV-002` (emergency halt).

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness, coherence, coherence stage, engine count, global Merkle root |
| POST | `/telemetry/inject` | — | Inject sensor context; returns `[TELEMETRY] STAGE=…` + modifiers |
| POST | `/orchestrate/action` | `X-API-Key` | Run an ORC action (`ORC-001` … `ORC-005`) |
| GET | `/audit/verify` | — | Verify every engine's Merkle chain end-to-end |
| GET | `/persona` | — | Persona runtime summary + thresholds |
| POST | `/voice/synthesize` | — | VoiceΩ neural TTS (VOX-001) |
| POST | `/voice/podcast` | — | VoiceΩ document-to-podcast mix (VOX-003) |
| GET | `/` | — | Static mount of the built portal (graceful fallback page if absent) |

Set `SOE_API_KEY` to require a specific key value on `/orchestrate/action`
(if unset, any non-empty `X-API-Key` is accepted — the blueprint's Merkle-presence check).

## ORC catalogue

| ID | Name | Flow |
|---|---|---|
| ORC-001 | Full Sovereign System Audit | pre-flight 11 engines → ALC-001 RUBEDO → GEO-003 → BLO-001 → SIN-001(100) → REA-001 → 6 supporting actions → aggregate Merkle chain → persist JSON |
| ORC-002 | Philosopher's Stone Reality Weave | ALC-001 RUBEDO → REA-001 (base reality) → REA-002 (woven thread) |
| ORC-003 | Quantum-Hyperdimensional Mapping | BLO-001 (6 base states) → GEO-001 (Bloch x/y/z as 5D w/v) → GEO-002 (tetrahedron) |
| ORC-004 | Singularity Transcendence Sequence | SIN-001(1000) → ALC-001 RUBEDO → REA-001 (D=12) → ENT-001 |
| ORC-005 | End-to-End Merkle Audit | collect roots → hash global root → verify every transition → flag broken links |

## Governance

| ID | Trigger | Behaviour |
|---|---|---|
| GOV-001 | engine coherence < 0.999 | reset engine to its INIT Merkle root, replay the last action with reduced noise |
| GOV-002 | coherence < 0.95 / chain break / exception | freeze all state, dump a full debug log, alert the operator |
| GOV-003 | operator request / corrupted state | reinitialise all engines, regenerate initial roots, zero audit history |

## Run

```powershell
# from the monorepo root (sovereign-portal-c137)
python -m pip install -r apps/soe-core/requirements.txt

# audit CLI (writes apps/soe-core/sovereign_audit_results.json)
python apps/soe-core/run_audit.py

# gateway (dev)
python apps/soe-core/gateway.py        # http://127.0.0.1:8000

# tests
python -m pytest apps/soe-core/tests -q
```

### VoiceΩ optional extras

```powershell
python -m pip install librosa soundfile openai PyPDF2 python-docx gtts requests
$env:OPENAI_API_KEY = "sk-..."          # enables POST /voice/synthesize
$env:ELEVENLABS_API_KEY = "sk_..."      # enables the ElevenLabs backend
```

## Windows `.exe` packaging (PyInstaller)

`desktop_launcher.py` starts the gateway in a background thread, waits for
`/health`, opens the portal in the default browser and prints the ASCII banner.
It resolves the website through `resolve_web_root()` in this order:

1. `sys._MEIPASS/web` 2. `<cwd>/web` 3. `<cwd>/../../dist/website` 4. `<exe dir>/web`

```powershell
# from the monorepo root
python -m pip install pyinstaller
python -m PyInstaller --noconfirm --onefile --name SovereignPortalC137 `
  --add-data "dist\website;web" `
  --paths apps\soe-core `
  apps\soe-core\desktop_launcher.py
# -> dist\SovereignPortalC137.exe
```

Then (optionally) hash it:

```powershell
Get-FileHash .\dist\SovereignPortalC137.exe -Algorithm SHA256
```

Launcher flags: `--no-browser`, `--port <int>`, `--audit`.
