# ============================================================================
# Sovereign Portal C-137 — unified developer command surface
# On Windows these targets run under Git Bash / WSL or `make` from GnuWin.
# ============================================================================
SHELL := /bin/sh
.DEFAULT_GOAL := help

ROOT      := $(CURDIR)
WEB       := apps/web-portal
PWA       := apps/web-pwa
SOE       := apps/soe-core
DIST      := dist

.PHONY: help
help: ## Show every available target
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ------------------------------------------------------------------ install --
.PHONY: install
install: ## Install all JS workspace dependencies
	pnpm install

.PHONY: install-py
install-py: ## Install the Python SOE runtime + test deps
	python -m pip install -r $(SOE)/requirements.txt

.PHONY: install-all
install-all: install install-py ## Install everything

# ---------------------------------------------------------------------- dev --
.PHONY: dev
dev: ## Run every dev server in parallel (turbo)
	pnpm dev

.PHONY: portal
portal: ## Serve the shipped static website on :8080
	python -m http.server 8080 --directory $(WEB)

.PHONY: soe
soe: ## Launch the SOE desktop launcher (gateway + browser)
	python $(SOE)/desktop_launcher.py

# -------------------------------------------------------------------- build --
.PHONY: build
build: ## Build the JS monorepo (turbo)
	pnpm build

.PHONY: build-portal
build-portal: ## Copy the shipped website into dist/website
	node tools/build-portal.mjs

.PHONY: build-pwa
build-pwa: ## Build the React 19 PWA bundle
	pnpm --filter @portal/web-pwa build

.PHONY: build-exe
build-exe: ## Compile dist/windows/SovereignPortalC137.exe (PyInstaller)
	powershell -ExecutionPolicy Bypass -File windows/build-exe.ps1

.PHONY: build-apk
build-apk: ## Compile dist/android/SovereignPortalC137.apk
	python tools/build_apk.py

.PHONY: build-paf
build-paf: ## Package a PortableApps (PAF) bundle
	python apps/portable-builder/paf_builder.py --source $(WEB) --output Builds/paf --zip

.PHONY: dist
dist: ## Assemble the full dist/ artifact tree
	node tools/make-dist.mjs

.PHONY: dist-all
dist-all: build-portal build-exe build-apk dist ## Build every shippable artifact

# -------------------------------------------------------------------- tests --
.PHONY: test
test: ## Run every test suite
	pnpm test
	python -m pytest $(SOE)/tests -q

.PHONY: test-soe
test-soe: ## Run the SOE pytest suite
	python -m pytest $(SOE)/tests -q

.PHONY: audit
audit: ## Run the ORC-001 full sovereign system audit
	python $(SOE)/run_audit.py

.PHONY: typecheck
typecheck: ## TypeScript typecheck across the monorepo
	pnpm typecheck

.PHONY: lint
lint: ## Lint the monorepo
	pnpm lint

# ------------------------------------------------------------------ docker ---
.PHONY: docker-up
docker-up: ## Start the sovereign docker compose stack
	docker compose -f docker/docker-compose.yml up -d --build

.PHONY: docker-down
docker-down: ## Stop the stack
	docker compose -f docker/docker-compose.yml down

.PHONY: docker-prod
docker-prod: ## Start the production stack (ollama + orchestrator + prometheus)
	docker compose -f docker/docker-compose.prod.yml up -d --build

# ------------------------------------------------------------------ models ---
.PHONY: models
models: ## Download the quantized WebGPU model weights
	python tools/download_models.py

# ------------------------------------------------------------------- clean ---
.PHONY: clean
clean: ## Remove build output and caches
	pnpm clean || true
	rm -rf $(DIST) Builds .turbo
	find . -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find . -name .pytest_cache -type d -prune -exec rm -rf {} + 2>/dev/null || true
