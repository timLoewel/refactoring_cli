## Design: TypeScript Refactoring Edge Cases

### Approach

Vertical-slice TDD: one refactoring at a time. Within each slice, add all fixtures first (expect failures), then fix the implementation until all pass. Commit between slices.

### Order

1. **rename-variable** — Low risk. ts-morph handles most cases. Mainly adding documentation-via-tests. Possible small impl fix for function parameters.
2. **inline-function** — Medium risk. Significant implementation work: parameter substitution, return value inlining, broader function form support, safety preconditions.
3. **extract-function** — High risk. Scope analysis is complex. Reference the Python implementation's approach (variable read/write analysis) as a model.
4. **move-function** — Highest risk. Cross-file import rewriting. Use ts-morph's language service for reference finding.

### Key Design Decisions

**Inline Function — Parameter Substitution Strategy:**
- Simple text replacement: replace parameter name identifiers in body text with call-site argument text
- Use ts-morph AST traversal to find parameter references and replace them (safer, handles shadowing)
- Decision: AST-based replacement for correctness

**Inline Function — Multi-statement Body:**
- When function has multiple statements and is called in expression position: refuse (precondition error)
- When called as standalone statement: can inline all statements in place
- Single `return <expr>` body: inline as expression anywhere

**Extract Function — Scope Analysis:**
- Walk extracted statements' descendants, collect all identifier references
- For each: check if it's declared inside or outside the extraction range
- Outside + read → parameter
- Inside + used after → return value
- Inside + mutated after → refuse (or return modified value)

**Move Function — Import Strategy:**
- Analyze function body for symbol references
- Cross-reference with source file imports → determine which imports to carry
- Use ts-morph's `findReferencesAsNodes()` to find all files importing the moved function
- Rewrite import paths in those files

### Fixture Philosophy

- Each fixture is a self-contained program exporting `main(): string`
- The fixture runner verifies: (a) output unchanged, (b) code structurally changed
- Fixtures that test precondition rejections need special handling — they should NOT export params (or the test runner should handle expected failures). TBD: may need to extend the fixture runner to support "expected failure" fixtures.
- ESLint already ignores `**/*.fixture.ts` — no config changes needed
