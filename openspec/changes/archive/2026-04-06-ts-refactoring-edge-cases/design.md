## Context

The refactoring CLI uses a fixture-based testing model: each `.fixture.ts` file exports `params` and a `main()` function, and the auto-discovery test runner (`all-fixtures.test.ts`) applies the refactoring and checks semantic preservation via snapshot comparison. Sections 1-12 of tasks.md added fixture suites for 12 core refactorings and fixed bugs found during those runs. Section 13 extends this to the remaining 53 refactorings.

The existing test infrastructure (fixture-runner, auto-discovery, registry-based lookup) is mature and does not need modification — this change is purely about adding fixture files and fixing transformation bugs they expose.

## Goals / Non-Goals

**Goals:**
- Systematic edge-case coverage for every refactoring in the CLI
- TDD workflow: write fixtures first, run tests, fix failures discovered
- Fix real transformation bugs (precedence, scope, type inference, multi-file) as they surface

**Non-Goals:**
- Changing the fixture runner infrastructure or test harness
- Modifying the CLI interface or command structure
- Adding new refactoring types
- Performance optimization of existing refactorings
- Python fixture coverage (separate concern)

## Decisions

### 1. TDD fixture-first workflow

Write fixtures before fixing bugs. Each fixture encodes the expected behavior as a `params` export + `main()` function. The auto-discovery runner picks them up automatically — no test boilerplate needed per fixture.

**Rationale:** Fixtures serve as both regression tests and executable documentation of edge-case behavior. Writing them first ensures bugs are caught by a failing test before being fixed.

### 2. Fixture naming convention

Each fixture file is named `<edge-case>.fixture.ts` and placed in the refactoring's `fixtures/` directory. Names describe the scenario, not the bug (e.g., `operator-precedence.fixture.ts` not `fix-parens-bug.fixture.ts`).

**Rationale:** Scenario names remain stable even if the underlying implementation changes. The auto-discovery runner uses the filename as the test name.

### 3. Multi-file fixtures use directory structure

For refactorings that operate across files (e.g., move-function), fixtures use a subdirectory containing multiple `.ts` files rather than a single fixture file.

**Rationale:** Matches the existing `move-function/fixtures/no-deps/` pattern already established in the codebase.

### 4. Precondition errors as valid fixture outcomes

Some fixtures intentionally trigger precondition failures (e.g., `recursive-reject.fixture.ts` for inline-function). These are valid edge cases — the refactoring should refuse rather than produce broken code.

**Rationale:** Ensuring correct rejection is as important as ensuring correct transformation. The fixture runner handles precondition errors as expected outcomes.

### 5. Section 13: 3-5 fixtures per refactoring, one commit per batch

Each of the 53 remaining refactorings gets 3-5 fixtures covering the most important edge cases from its spec. Fixtures are committed per-refactoring after tests pass.

**Rationale:** Keeps commits atomic and bisectable. 3-5 fixtures per refactoring balances coverage against the volume of work (53 refactorings).

## Risks / Trade-offs

- **Volume of fixtures may surface many bugs** → Mitigation: fix bugs as they arise within each task section; don't defer fixes to a separate pass.
- **Some refactorings may have fundamental limitations** → Mitigation: add precondition checks to refuse gracefully rather than producing broken output. Document limitations in fixture names (e.g., `*-reject.fixture.ts`).
- **Large number of new files (~200+)** → Mitigation: all files follow the established `fixtures/` directory convention and are auto-discovered, so no index maintenance needed.
