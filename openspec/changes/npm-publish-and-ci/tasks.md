## 1. Version Automation

- [x] 1.1 Add `prebuild` script to package.json that generates `src/core/cli/version.ts` from package.json
- [ ] 1.2 Add `src/core/cli/version.ts` to `.gitignore`
- [ ] 1.3 Remove the hardcoded `version.ts` from git tracking (`git rm --cached`)
- [ ] 1.4 Verify `npm run build` produces correct version in `dist/core/cli/version.ts`

## 2. Package.json Packaging

- [ ] 2.1 Add `"files": ["dist"]` to package.json
- [ ] 2.2 Add `"prepublishOnly": "npm run build"` to scripts
- [ ] 2.3 Add `repository`, `homepage`, and `bugs` fields pointing to timLoewel/refactoring_cli
- [ ] 2.4 Verify `npm pack --dry-run` only includes dist/, package.json, README.md

## 3. CI Workflow

- [ ] 3.1 Create `.github/workflows/ci.yml` — lint, build, test on push/PR to main, Node 18 + 22 matrix

## 4. Publish Workflow

- [ ] 4.1 Create `.github/workflows/publish.yml` — build, npm publish on `v*` tag, create GitHub Release

## 5. README.md

- [ ] 5.1 Create `README.md` with: what it is, installation, CLI usage examples, available commands
- [ ] 5.2 Add "Using with Claude Code" section with CLAUDE.md snippet
- [ ] 5.3 Add "Using with OpenCode" section with equivalent config

## 6. CLAUDE.md Update

- [ ] 6.1 Add refactor CLI usage section to `CLAUDE.md` teaching the agent to prefer `refactor` commands for refactoring tasks
