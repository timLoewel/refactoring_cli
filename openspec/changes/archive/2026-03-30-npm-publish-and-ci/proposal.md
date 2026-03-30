## Why

The CLI works but can only be used from inside this repo. To fulfill its purpose — an agent-consumable refactoring tool for any TypeScript codebase — it needs to be installable globally via `npm install -g refactoring-cli`. There is no CI pipeline, no publish automation, and no documentation for external users.

## What Changes

- Generate `version.ts` at build time from `package.json` instead of maintaining a hardcoded copy
- Add `files`, `prepublishOnly`, and repository metadata to `package.json` so only `dist/` ships
- Add CI workflow (lint, build, test on Node 18 + 22) for push/PR to main
- Add publish workflow triggered by `v*` tags (npm publish + GitHub Release)
- Create `README.md` with installation, usage, and integration guides for Claude Code and OpenCode
- Add refactor CLI usage instructions to the project's own `CLAUDE.md`

## Capabilities

### New Capabilities
- `npm-distribution`: Package metadata, build hooks, and file scoping for npm global install
- `ci-cd`: GitHub Actions workflows for continuous integration and automated publishing

### Modified Capabilities
- `cli-framework`: Version handling changes from hardcoded to build-time generation

## Impact

- `package.json` — new fields and scripts
- `src/core/cli/version.ts` — becomes a generated file
- `.gitignore` — excludes generated version.ts
- `.github/workflows/` — two new workflow files alongside existing `roam.yml`
- `README.md` — new file at repo root
- `CLAUDE.md` — new section added
- Requires manual one-time setup: `NPM_TOKEN` secret on GitHub, `npm login`
