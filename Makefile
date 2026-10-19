# Project interface (defuss-vae layout): the same verbs for humans, agents and CI; `make` lists them with usage.
# Service: RUN = foreground command; stdout/stderr → var/log/$(NAME).*, pid → tmp/$(NAME).pid (both gitignored).
# test/coverage/lint/e2e exit 2 (UNKNOWN) until defined: the verifier runs them on every gate,
# and e2e must leave fresh files in output/ (the consumer's results or a Playwright report).
# Toolchain: new projects start on bun (JS/TS) or uv (Python); each placeholder names the default recipe.
# RUN e.g. `bun run src/index.ts` (bun loads .env) | `uv run --env-file .env python -m app`; apps log ISO-8601 UTC first, exit cleanly on SIGTERM.
NAME ?= website
# Serves the built website (make website) on http://localhost:4173.
RUN  ?= bunx defuss-ssg serve website --port 4173 --skip-setup
N    ?= 50
export RUN
# Config: KEY=value lines of the gitignored .env reach every recipe and the app `start` runs. Make reads them, so
# `#` starts a comment and `$` must be `$$`; values needing either belong in the app's own .env loader.
-include .env
ENV_KEYS := $(shell sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' .env 2>/dev/null)
ifneq ($(ENV_KEYS),)
export $(ENV_KEYS)
endif
# Installer default dirs as a fallback (uv, bun, mise shims, rustup, go install, dotnet tools): shell recipes find tools
# setup just installed, while tools already on PATH keep precedence.
export PATH := $(PATH):$(HOME)/.local/bin:$(HOME)/.bun/bin:$(HOME)/.local/share/mise/shims:$(HOME)/.cargo/bin:$(HOME)/go/bin:$(HOME)/.dotnet/tools
LOG   = var/log/$(NAME)
PID   = tmp/$(NAME).pid
ALIVE = [ -f $(PID) ] && kill -0 "$$(cat $(PID))" 2>/dev/null

.PHONY: help setup start stop restart status log metrics bench test coverage lint e2e verify build website website-assets dev vscode-extension vscode-package vscode-e2e vscode-publish
.DEFAULT_GOAL := help

help: ## list the verbs with their usage (default goal)
	@awk -F':.*## ' '/^[a-zA-Z0-9_ -]+:.*## /{printf "  %-12s %s\n", $$1, $$2}' $(firstword $(MAKEFILE_LIST))

# Fresh clone or machine: tools pinned in mise.toml, official installers for a missing uv/bun, then exactly the
# locked deps. Only declared toolchains are touched, so an existing npm/poetry project is never migrated silently.
setup: ## install pinned tools (mise.toml) and exactly the locked dependencies
	@if [ -f mise.toml ] || [ -f .tool-versions ]; then command -v mise >/dev/null 2>&1 || curl -fsSL https://mise.run | sh; mise install; fi
	@if [ -f uv.lock ]; then command -v uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh; uv sync --locked; fi
	@if [ -f bun.lock ] || [ -f bun.lockb ]; then command -v bun >/dev/null 2>&1 || curl -fsSL https://bun.sh/install | bash; bun install --frozen-lockfile; fi
	bunx playwright install chromium

# No service (library)? Replace start..log with one line: start stop restart status log: ; @echo "∅ $@: no service"
# Own process group (setsid, else job control) so stop reaps children too; redirected stdio keeps agent shells from hanging.
start: ## run RUN detached: pid in tmp/, stdout|stderr appended to var/log/
	@mkdir -p var/log tmp
	@if $(ALIVE); then echo "running pid=$$(cat $(PID))"; exit 0; fi; \
	[ -n "$$RUN" ] || { echo "UNKNOWN[start] BC RUN unset"; exit 6; }; \
	if command -v setsid >/dev/null 2>&1; then nohup setsid sh -c "$$RUN" >$(LOG).stdout 2>$(LOG).stderr </dev/null & \
	else set -m; nohup sh -c "$$RUN" >$(LOG).stdout 2>$(LOG).stderr </dev/null & set +m; fi; \
	echo $$! >$(PID); sleep 1; \
	if $(ALIVE); then echo "running pid=$$(cat $(PID))"; else echo "dead; see: make log"; exit 1; fi

stop: ## SIGTERM the service group, SIGKILL after 5 s
	@if $(ALIVE); then p=$$(cat $(PID)); kill -s TERM -- -$$p 2>/dev/null || kill -s TERM $$p; \
	i=0; while kill -0 $$p 2>/dev/null && [ $$i -lt 50 ]; do sleep 0.1; i=$$((i+1)); done; \
	kill -s KILL -- -$$p 2>/dev/null || true; fi; rm -f $(PID); echo stopped

restart: stop start ## stop, then start

# LSB codes (make prints them as Error N): 0 running, 1 dead with stale pid, 3 stopped.
status: ## running | dead (stale pid) | stopped, as LSB exit codes
	@if $(ALIVE); then echo "running pid=$$(cat $(PID))"; \
	elif [ -f $(PID) ]; then echo "dead pid=$$(cat $(PID)); see: make log"; exit 1; \
	else echo stopped; exit 3; fi

log: ## tail stdout and stderr logs (N=50 lines)
	@for f in $(LOG).stdout $(LOG).stderr; do [ -f $$f ] && { echo "== $$f"; tail -n $(N) $$f; }; done; \
	ls $(LOG).* >/dev/null 2>&1 || echo "∅ no logs for $(NAME)"

metrics:  ; @echo "∅ metrics: library and static site, no running metrics"  ## print current service|build metrics
bench:    ; @echo "∅ bench: no performance claims made"  ## measure hot paths before perf claims

build: ## build the library into dist/ (ESM, CJS, type declarations)
	bun run build

# defuss-ssg copies the site into .ssg-temp/ next to the working directory; run from the repo root so
# website/components can import the library as ../../src/index.ts in dev and build alike.
website-assets: vscode-package ## copy defuss-shadcn bundles, sample .blend files, the extension .vsix and its preview styles into website/assets
	@mkdir -p website/assets/vendor website/assets/samples
	cp node_modules/defuss-shadcn/dist/components/core.min.css node_modules/defuss-shadcn/dist/components/all.min.css node_modules/defuss-shadcn/dist/components/all.min.js node_modules/defuss-shadcn/dist/theme/tangerine.css website/assets/vendor/
	@mkdir -p website/assets/samples/textures
	cp input/v43.blend input/scene_v52.blend input/texture_v43.blend website/assets/samples/
	cp input/textures/texture_base.png input/textures/texture_normal.exr website/assets/samples/textures/
	cp vscode-extension/media/preview.css website/assets/vendor/blend-preview.css
	cp vscode-extension/blendfile-preview.vsix website/assets/

website: website-assets ## build the static website into website/dist
	bunx defuss-ssg build website --skip-setup

dev: website-assets ## run the website dev server on http://localhost:3000
	bunx defuss-ssg dev website --skip-setup

# VS Code extension: host bundle (CJS, also loadable by vscode.dev), webview bundle (IIFE), integration suite.
vscode-extension: ## bundle the VS Code extension into vscode-extension/dist and media/preview.js
	bun build vscode-extension/src/host/extension.ts --outfile vscode-extension/dist/extension.cjs --format cjs --target browser --external vscode
	bun build vscode-extension/src/webview/preview.tsx --outfile vscode-extension/media/preview.js --format iife --target browser --minify
	bun build vscode-extension/test-electron/suite.ts --outfile vscode-extension/dist/test-suite.cjs --format cjs --target node --external vscode

vscode-package: vscode-extension ## pack the extension into vscode-extension/blendfile-preview.vsix
	cd vscode-extension && bunx @vscode/vsce package --no-dependencies --out blendfile-preview.vsix

vscode-e2e: vscode-package ## install the .vsix into a throwaway VS Code profile and open every fixture in it
	bun vscode-extension/test-electron/run.ts

# Tokens come from the environment: VSCE_PAT (Azure DevOps, Marketplace → Manage) and OVSX_PAT (open-vsx.org).
vscode-publish: vscode-e2e ## publish the tested .vsix to the VS Code Marketplace and Open VSX
	cd vscode-extension && bunx @vscode/vsce publish --packagePath blendfile-preview.vsix
	cd vscode-extension && bunx ovsx publish blendfile-preview.vsix

test: ## unit + integration tests against real Blender fixtures
	bun test test/

coverage: ## print line coverage of src/
	bun test test/ --coverage

lint: ## oxlint (warnings fail) and TypeScript checks for library and website
	bunx oxlint --deny-warnings src test tools e2e website/components website/lib website/config.ts vscode-extension/src vscode-extension/test-electron
	bunx tsc --noEmit
	bunx tsc --noEmit -p website
	bunx tsc --noEmit -p vscode-extension

e2e: build website vscode-e2e ## clean consumer (Node ESM + CJS), Playwright over the website and the extension webview, the .vsix in real VS Code
	bun e2e/consumer.ts
	bunx playwright test -c e2e/playwright.config.ts

# What CI runs; the gate runs the same verbs one by one and fails while verify skips any. Fail-fast order: cheapest first.
verify: lint test coverage e2e ## what CI runs: every gate verb, cheapest first
