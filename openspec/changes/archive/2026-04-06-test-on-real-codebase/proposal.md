## Why

The refactoring CLI is tested against hand-crafted fixtures, but these can't expose the full range of patterns found in production codebases. Testing against a real, pinned TypeScript project lets us discover crashes, incorrect transformations, and precondition gaps that only appear on realistic code.

## What Changes

- New `scripts/test-real-codebase/` script that clones a pinned version of a target TypeScript project (initially TypeORM), scans for valid refactoring targets, applies each one, and verifies the result compiles with `tsc --noEmit`.
- A summary report (stdout + optional JSON) listing per-refactoring: targets found, applied, passed, failed.
- A `--dry-run` mode that skips application and only reports discovered targets.

## Capabilities

### New Capabilities

- `real-codebase-test-runner`: A script (or `npm run test:real`) that clones a pinned real-world TS codebase, auto-discovers refactoring targets, applies them one at a time in isolation, and checks compilation after each.

### Modified Capabilities

## Impact

- New `scripts/test-real-codebase/` directory with a runner script
- `package.json`: new `test:real` script entry
- No changes to core CLI or existing refactoring logic
- Adds a dependency on `git` (for cloning) and a pinned TypeORM commit
