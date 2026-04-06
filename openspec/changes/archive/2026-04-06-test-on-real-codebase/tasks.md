## 1. Project Setup

- [x] 1.1 Create `scripts/test-real-codebase/` directory and `run.ts` entry point
- [x] 1.2 Add `test:real` script to `package.json`
- [x] 1.3 Add `tsx` (or `ts-node`) invocation for the script if not already available

## 2. Clone and Cache

- [x] 2.1 Define pinned TypeORM SHA constant and remote URL in script config
- [x] 2.2 Implement clone logic: skip if `tmp/real-codebase/<sha>/` already exists, otherwise `git clone --depth 1` at the pinned SHA
- [x] 2.3 Verify the cache directory contains a valid TypeScript project (has `tsconfig.json`)

## 3. Baseline Verification

- [x] 3.1 Run `tsc --noEmit` on the cloned codebase using its own `tsconfig.json`
- [x] 3.2 Abort with a clear error message if baseline compilation fails

## 4. Target Discovery

- [x] 4.1 Load all registered refactorings from the CLI registry
- [x] 4.2 For each refactoring, scan the target codebase for symbols where preconditions pass (use `refactor apply --dry-run` or precondition API)
- [x] 4.3 Respect `--refactoring <name>` flag to limit to a single refactoring

## 5. Isolated Apply and Compile

- [x] 5.1 Implement copy-on-apply: copy the cached working tree to a fresh temp dir per candidate
- [x] 5.2 Apply the refactoring in the temp copy using the CLI
- [x] 5.3 Run `tsc --noEmit` in the temp copy after apply
- [x] 5.4 Record result (passed / failed + error) and clean up temp copy
- [x] 5.5 Handle CLI crash during apply: catch error, record as failed, continue

## 6. Dry-Run Mode

- [x] 6.1 Implement `--dry-run` flag: skip apply and compile steps, print target counts and exit

## 7. Summary Report

- [x] 7.1 Collect per-refactoring stats: targets found, applied, passed, failed
- [x] 7.2 Print a text summary table to stdout after all candidates are processed
- [x] 7.3 Implement `--json` flag: emit structured JSON with per-refactoring stats and failure details
