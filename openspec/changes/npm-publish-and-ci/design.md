## Context

The CLI is functional and tested locally but has no distribution mechanism. The `bin.refactor` field in package.json already points to the correct entry point, and `--path <dir>` already supports targeting external projects. The gap is purely packaging, automation, and documentation.

Current state:
- `dist/` is gitignored (correct) but not built before publish
- No `files` field — `npm pack` includes 622 files (tests, fixtures, openspec, .claude/)
- `version.ts` is hardcoded, duplicating the version from package.json
- No CI pipeline, no publish workflow, no README

## Goals / Non-Goals

**Goals:**
- `npm install -g refactoring-cli` works and exposes the `refactor` command
- CI validates every push/PR (lint, build, test)
- Publishing is automated via git tags (`npm version patch && git push --tags`)
- External users can learn how to use the tool from the README
- AI agents (Claude Code, OpenCode) can be configured to use the tool via documented snippets

**Non-Goals:**
- Monorepo tooling, changesets, or automated changelog generation
- npm provenance signing or attestations
- Canary/next release channels
- Bundling (tsc output is sufficient, no rollup/esbuild needed)
- Windows CI matrix (ubuntu-latest is sufficient for now)

## Decisions

### Version source of truth: package.json with build-time generation

Generate `src/core/cli/version.ts` from package.json during the `prebuild` script. The file is gitignored since it's a build artifact.

**Script:** `node -e "const p=require('./package.json'); require('fs').writeFileSync('src/core/cli/version.ts', 'export const version = \"' + p.version + '\";\\n')"`

**Alternative considered:** Runtime `fs.readFileSync` of package.json — rejected because it adds a filesystem dependency and requires knowing the package.json path relative to the compiled output.

**Alternative considered:** `import pkg from '../../package.json' with { type: 'json' }` — rejected because JSON imports require additional tsconfig flags and aren't universally supported.

### Tag-triggered publish with GitHub Actions

The publish workflow triggers on `v*` tags. The release flow:
1. `npm version patch` (bumps package.json, commits, tags)
2. `git push --follow-tags`
3. CI runs on the push, publish workflow runs on the tag
4. npm publish uses `NPM_TOKEN` automation token (bypasses 2FA)

**Alternative considered:** GitHub Release UI trigger — rejected because it decouples versioning from the code.

### CI matrix: Node 18 + 22

Matches the `engines.node >= 18` constraint. Tests on oldest supported and current LTS.

### README structure

Targeted at two audiences:
1. **Human developers** — installation, CLI usage examples
2. **AI agents** — copy-paste CLAUDE.md / OpenCode config snippets

## Risks / Trade-offs

- [Version.ts is gitignored] → Contributors must run `npm run build` before the CLI works locally. Mitigated by the `prebuild` script running automatically.
- [NPM_TOKEN secret required] → Manual one-time setup. Document in README or CONTRIBUTING.
- [Hardcoded version in tests] → If any test imports version.ts, it'll fail without a build. Currently no tests reference it.
