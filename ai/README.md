# ai/ — Sovereign Persona & Local LLM Runtime

Persona definition and the Ollama model build for the Rick C-137 sovereign core.

| File | Purpose |
| :--- | :--- |
| `Modelfile.rick-c137` | Ollama Modelfile: `llama3.3:70b-instruct-q4_K_M` base, sampling params, the full **SYSTEM** persona prompt, and stop tokens. |
| `persona-prompt.md` | The Section 1 Unified Sovereign System Integration Prompt in full, plus the runtime binding table and telemetry hook contract. |

## Build & run the local model

```bash
# 1. Start the GPU LLM core (see docker/docker-compose.prod.yml)
docker compose -f docker/docker-compose.prod.yml up -d llm-core

# 2. Create the sovereign model inside the Ollama container
docker exec -it rick-llm-core ollama create rick-c137 -f /root/Modelfile.rick-c137

# 3. Chat
docker exec -it rick-llm-core ollama run rick-c137
```

Or, with a host-installed Ollama:

```bash
ollama create rick-c137 -f ai/Modelfile.rick-c137
ollama run rick-c137
```

## Sampling parameters

| Parameter | Value |
| :--- | :--- |
| `temperature` | 0.82 |
| `top_p` | 0.92 |
| `top_k` | 50 |
| `repeat_penalty` | 1.15 |
| `stop` | `<|eot_id|>`, `<|end_of_text|>`, `[END_STREAM]` |

## Binding surfaces

- **Ollama / SOE orchestrator** — the 70B model serves as the heavy reasoning core.
- **Offline WebLLM (PWA)** — the same persona prompt is injected as the `system` message,
  so the on-device Llama-3.2-1B twin behaves consistently with the server model.
- **Gateway** — `apps/soe-core/gateway.py` prepends the persona and enforces the
  coherence hard-stop (`>= 0.999`) before any orchestration action is executed.

## Canonical portal constants

```
dimension  : C-137
resonance  : 1207 Hz
stability  : 99.87%
palette    : --portal-green #00ff88 · --portal-yellow #d4ff00 · --hud-cyan #00e5ff · void #020b05
```

> The persona is fictional. It is part of a self-contained, offline-first interface project.
