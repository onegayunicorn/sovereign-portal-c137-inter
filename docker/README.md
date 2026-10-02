# docker/ — Sovereign Portal C-137 container infrastructure

Multi-target containerization for the portal: a static nginx runtime for the PWA,
a Python SOE orchestrator, and a production stack with GPU LLM inference + metrics.

## Contents

| File | Purpose |
| :--- | :--- |
| `Dockerfile` | Multi-stage Node 22 → nginx:alpine build of `@portal/web-pwa` using `turbo prune`. |
| `Dockerfile.orchestrator` | `python:3.11-slim` runtime executing `apps/soe-core` (SOE + FastAPI gateway). |
| `nginx.conf` | COOP/COEP cross-origin isolation, CSP with `wasm-unsafe-eval`, gzip (incl. `application/wasm`), `/models/` byte-ranges + immutable cache, SPA fallback, no-cache `sw.js`. |
| `docker-compose.yml` | Local stack: `portal-ui` + `postgres:16-alpine` + `matrix-dendrite`. |
| `docker-compose.prod.yml` | Production stack (blueprint §5): `llm-core` (Ollama + NVIDIA GPU) + `sovereign-orchestrator` + `prometheus`. |
| `prometheus.yml` | Scrape config for the orchestrator, Merkle audit endpoint, and Ollama. |

## Build & run

```bash
# Local sovereign stack (UI + Postgres + Dendrite)
docker compose -f docker/docker-compose.yml up -d --build
docker compose -f docker/docker-compose.yml ps

# Production stack (Ollama GPU + SOE orchestrator + Prometheus)
docker compose -f docker/docker-compose.prod.yml up -d --build

# Standalone image build
docker build -t sovereign-portal:v1.0.0 -f docker/Dockerfile .
```

## Endpoints

| Service | URL | Notes |
| :--- | :--- | :--- |
| Portal UI | http://localhost:8080 | nginx runtime (`/healthz` for probes) |
| PostgreSQL | localhost:5432 | db `portal_c137`, user `rick` |
| Matrix (Dendrite) | http://localhost:8448 | federated E2EE mesh |
| SOE orchestrator | http://localhost:8000 | `/telemetry/inject`, `/orchestrate/action`, `/audit/verify` |
| Ollama LLM core | http://localhost:11434 | serves `rick-c137` from `ai/Modelfile.rick-c137` |
| Prometheus | http://localhost:9090 | metrics + audit scrape |

## Cross-origin isolation

The nginx runtime sets `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, so `crossOriginIsolated === true`
and WebGPU / `SharedArrayBuffer` (WebLLM, Whisper-STT) operate offline. Because
isolation is applied *only* at the edge/gateway (never inside the built bundle),
there are no CO-OP breakage or leaked-embedder regressions.

## Environment

```bash
# Generate a DB password for the local stack
echo "DB_PASSWORD=$(openssl rand -hex 16)" > .env
```
