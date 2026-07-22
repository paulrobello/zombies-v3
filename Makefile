# par-zombie3 — standard developer targets.
# The project uses yarn + webpack + tsc; this Makefile is the canonical entry
# point so the same commands work locally and in CI (see .github/workflows/deploy.yml).
.PHONY: build typecheck test lint fmt checkall pre-commit help

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

build: ## Type-check then bundle with webpack (production mode)
	yarn build

typecheck: ## Run tsc --noEmit (TypeScript 7 native compiler)
	yarn typecheck

test: ## Run Vitest unit tests (passes if no tests exist yet)
	yarn test

lint: ## Run ESLint on src/
	yarn lint

fmt: ## Format the whole tree with Prettier (in-place)
	yarn fmt

# Gate: typecheck -> lint -> test -> build. A failure at any step stops the chain
# (make's default behaviour with prerequisites), so a passing `checkall` means all
# four are green. Run this before pushing and in CI.
checkall: typecheck lint test build ## Run all gates (typecheck, lint, test, build)

pre-commit: ## Run pre-commit hooks across the whole tree (gitleaks + detect-private-key)
	pre-commit run --all-files
