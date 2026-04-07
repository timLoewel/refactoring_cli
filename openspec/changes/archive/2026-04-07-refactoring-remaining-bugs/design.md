## Context

Real-codebase testing against TypeORM (50 candidates × 66 refactorings) produced 769 failures across ~1300 attempts. After fixing 13 bugs in the first pass, the remaining failures fall into systemic categories that require cross-cutting infrastructure changes rather than per-refactoring fixes.

The highest-impact category is unused declarations (135 failures across 6+ refactorings), followed by AST manipulation crashes (86), type inference falling back to `unknown` (52), and class hierarchy issues (50+). These affect many refactorings simultaneously and share root causes.

## Goals / Non-Goals

**Goals:**
- Reduce real-codebase failure rate from ~59% to under 30%
- Build reusable infrastructure (cleanup pass, safer AST patterns) that benefits all refactorings
- Improve enumerate functions so the test harness finds more valid candidates
- Fix Python test isolation so the full suite is reliable

**Non-Goals:**
- Achieving 100% pass rate on TypeORM (some failures are from `__reftest__` placeholder params — a test harness limitation, not a refactoring bug)
- Supporting every possible TypeScript pattern (complex generics, declaration files, ambient modules)
- Rewriting refactoring implementations from scratch — prefer surgical fixes and precondition additions

## Decisions

### 1. Shared unused-declaration cleanup utility

Build `cleanupUnused(sourceFile)` in `src/core/` that removes imports and variable declarations flagged as unused by the TypeScript compiler (diagnostic code TS6133). Each refactoring's `apply` calls it as a final step.

**Alternative considered:** Per-refactoring cleanup logic. Rejected because the problem is identical across refactorings — tracking which imports/vars each refactoring might orphan is fragile and duplicative.

**Alternative considered:** Running `fix-imports` CLI command after each refactoring. Rejected because `fix-imports` is designed for cross-file import fixing, not single-file unused symbol removal, and adds CLI overhead.

### 2. Precondition-first approach for AST crashes

Rather than making AST manipulation infallible, add preconditions that detect and reject cases likely to cause syntax errors (complex property access chains, decorator expressions, computed property names). This is cheaper and safer than building robust fallback logic.

**Alternative considered:** Text-based manipulation as fallback when AST fails. Rejected for now — text manipulation is error-prone for indentation and can introduce its own bugs. Can revisit if preconditions reject too many valid candidates.

### 3. Context-relative type printing everywhere

Standardize on `type.getText(node)` instead of `type.getText()` across all refactorings. The node-relative version resolves import paths to short names (e.g., `DataSource` instead of `import("/path").DataSource`). Fall back to `unknown` only for truly unresolvable types (anonymous, intersection with `typeof`).

### 4. Independent task sections

Each of the 7 task sections is independently implementable and testable. No section blocks another. This allows parallel work and incremental value delivery — unused cleanup alone addresses ~135 failures.

### 5. Python test isolation via parser caching

The tree-sitter parser failures in the full suite are caused by concurrent parser initialization across test files. Fix by making the parser a singleton with lazy initialization, and adding `afterAll` cleanup hooks.

## Risks / Trade-offs

- **[Risk] Unused cleanup removes intentionally unused variables** → Mitigation: Only remove declarations with TS6133 diagnostic that were introduced by the refactoring (compare before/after diagnostics). Alternatively, only clean up imports, not variables.
- **[Risk] Preconditions reject too many valid candidates** → Mitigation: Track rejection rates per precondition. If a precondition rejects >50% of candidates, it's too broad and needs refinement.
- **[Risk] `getText(node)` returns different strings depending on context** → Mitigation: Test with multi-file projects where types cross file boundaries.
- **[Risk] Unused cleanup has performance cost** → Mitigation: Only run when the refactoring modified declarations/imports. Skip for refactorings that only rename or move.

## Open Questions

- Should the cleanup pass be opt-in per refactoring or always-on? Always-on is simpler but adds overhead.
- Should we fix the `__reftest__` placeholder issue in the test harness (use actual param values from the target symbol) or accept it as a test limitation?
- For class hierarchy refactorings (change-value-to-reference, collapse-hierarchy): should we invest in fixing these or mark them as requiring manual review?
