## Context

The CLI has 66 TypeScript refactorings built on ts-morph. Every refactoring implementation directly uses ts-morph's AST APIs — there is no language abstraction layer. Python's AST, type system, and import model are fundamentally different from TypeScript's, so a shared abstraction would leak badly.

Python lacks a ts-morph equivalent (single library for type-aware CST manipulation). The viable approach combines two tools: pyright for semantic analysis (types, references, imports) and tree-sitter for CST parsing and source text editing.

## Goals / Non-Goals

**Goals:**
- Single CLI, single install, single repo for both TS and Python refactorings
- Python refactorings with cross-file reference tracking and type awareness
- Semantic preservation testing for Python (same guarantee as TS fixtures)
- Cover the subset of Fowler's catalog that maps meaningfully to Python

**Non-Goals:**
- Shared AST abstraction across languages (rejected — too leaky)
- Supporting untyped/dynamic Python patterns (setattr, metaclass magic, dynamic imports)
- Feature parity with TS on day one — incremental rollout
- Supporting Python < 3.10

## Decisions

### Three-layer architecture: pyright → codegen → tree-sitter

Each refactoring flows through three layers with distinct responsibilities:

```
┌─────────────────────────────────────────────┐
│           Refactoring Logic                  │
│  "extract these lines into a new function"   │
├──────────┬──────────────┬───────────────────┤
│ pyright  │  codegen     │  tree-sitter      │
│ (query)  │  (generate)  │  (parse + edit)   │
│          │              │                    │
│ types    │ import stmts │ read existing CST  │
│ refs     │ signatures   │ insert/remove nodes│
│ imports  │ annotations  │ write source text  │
│ defs     │ formatting   │                    │
└──────────┴──────────────┴───────────────────┘
```

- **pyright** finds things: what type is this, where are all references, where is the definition, what imports does this file use.
- **codegen** generates new Python source: import statements, function signatures, type annotations. This is the glue between "pyright says the type is `Optional[datetime]`" and "write valid Python that imports and uses that type."
- **tree-sitter** reads and writes: parse existing files into CST, locate nodes at positions, apply text edits, write modified source.

**Rationale:** pyright has no source manipulation API (it's a type checker, not an editor). tree-sitter has no semantic understanding (it's a parser). The codegen layer bridges them — it translates pyright's semantic facts into valid Python source text that tree-sitter can insert.

### Parallel builder, not generalized builder

`definePythonRefactoring` is a separate function from `defineRefactoring`. They share the registry and CLI layer but have independent project context types. The TS builder takes `ts-morph.Project`; the Python builder takes a context wrapping pyright LSP + tree-sitter parsers.

**Rationale:** The two AST models are too different to unify. A generic builder would complicate all 66 existing TS refactorings for no benefit. The registry and CLI are already language-agnostic — they operate on `RefactoringDefinition` which has no language-specific types in its interface.

### Pyright via LSP over stdio, not as embedded library

Drive `pyright-langserver --stdio` using JSON-RPC. Long-running process started on first Python refactoring, kept alive for the session.

**Rationale:** The LSP protocol is stable and documented. Pyright's internals (`pyright-internal`) have no stability guarantees and the repackaged npm version (`@zzzen/pyright-internal`) may lag or break. LSP gives us `textDocument/references`, `textDocument/definition`, `textDocument/hover`, `textDocument/rename` — all the semantic queries we need.

### LSP process lifecycle

The pyright LSP server is started lazily on first Python refactoring and kept alive for the CLI session. The client must handle:
- Graceful shutdown on CLI exit (LSP `shutdown` + `exit` requests)
- Crash recovery: if pyright dies mid-session, restart and re-initialize
- Initialization blocking: wait for pyright to finish project analysis before sending refactoring queries (don't timeout prematurely on large projects)

### tree-sitter for parsing and text manipulation

Use `tree-sitter` + `tree-sitter-python` npm packages. Parse Python files into CST, use positional info to apply text edits.

**Rationale:** tree-sitter has mature Node.js bindings, preserves all source text (comments, whitespace), and is fast. It handles the "read and edit" side while pyright handles the "understand" side.

### Preserve source annotations, don't rewrite them

When moving or extracting code, keep the original annotation syntax (`Optional[str]` stays `Optional[str]`, `str | None` stays `str | None`). Generate imports to match whatever syntax the source uses.

**Rationale:** Avoids opinionated formatting decisions. The refactoring tool should change structure, not style.

### Forced architecture reflection after two vertical slices

After implementing Rename Variable (single-file) and Move Function (multi-file), stop and evaluate:
- Is the pyright LSP latency acceptable?
- Is the tree-sitter edit model workable for complex transformations?
- Does the codegen layer handle import variants correctly?
- Should any architectural decisions be revised?

The remaining refactoring tasks may be rewritten based on findings.

## Testing Strategy

### Codegen: exhaustive matrix tested once

The codegen layer (import generation, import merging, annotation handling) is tested exhaustively via unit tests in tasks section 2. This covers:
- All 7 Python import styles + `if TYPE_CHECKING:` + `from __future__ import annotations` + `__all__`
- All annotation variants (PEP 604/585 builtins, typing module generics, nested generics, forward references, TypeAlias, TypeVar)
- Import merging edge cases (deduplication, grouping, aliased imports)

### Per-refactoring: basic + typed + edge case fixtures

Each refactoring gets fixtures tailored to its specific concerns:
- **basic** — the happy path, no type annotations
- **typed** — same refactoring but source code has type annotations; verifies they survive the transformation
- **cross-file** (for multi-file refactorings) — verifies import rewriting integrates with the codegen layer
- **edge case** — Python-specific gotchas relevant to that refactoring (e.g., `for`/`else` for control-flag-with-break, `yield` for extract-function, name mangling for rename-field)

This avoids repeating the full import/annotation matrix in every refactoring while still verifying each refactoring wires into the codegen layer correctly.

### Cross-cutting edge cases: tested on representative samples

Python gotchas that affect many refactorings (section 11 in tasks):
- `from __future__ import annotations` — tested on extract-function, move-function, extract-class, pull-up-method
- `if TYPE_CHECKING:` blocks — tested on move-function, extract-class, inline-class
- `async`/`await` variants — tested on extract-function, inline-function, move-function, substitute-algorithm
- Decorator preservation — tested on move-function, pull-up-method, push-down-method, rename-field
- Docstring preservation — tested on move-function, extract-function, pull-up-method, extract-class
- Name mangling (`__private`) — tested on rename-field, move-field, encapsulate-variable, pull-up-field
- `__all__` maintenance — tested on move-function, extract-class, inline-class, collapse-hierarchy, remove-subclass

### Semantic preservation: Python fixture runner

Parallel to the TS fixture runner. Each `.fixture.py` exports a `main()` function and a `params` dict. The runner:
1. Executes `main()` via Python subprocess → captures output (before)
2. Applies the refactoring
3. Executes `main()` again → captures output (after)
4. Asserts: output unchanged AND source structure changed

Multi-file fixtures use a directory with `entry.py` as the entry point. The test harness is `all-python-fixtures.test.ts`, discovered and run within the existing vitest suite.

## Risks / Trade-offs

### Pyright LSP latency
Each semantic query is a stdio round-trip. A refactoring touching many files may need dozens of requests. Mitigation: batch where possible, measure during vertical slices.

### Pyright startup time
Pyright needs to analyze the entire project before answering queries. First refactoring in a session will be slow. Mitigation: keep the LSP server running across refactorings.

### Pyright crash mid-session
If pyright crashes, in-flight refactoring fails. Mitigation: detect process exit, report clear error, auto-restart on next refactoring attempt.

### Python runtime dependency
Users need Python 3.10+ installed. This is reasonable for someone refactoring a Python codebase, but it's a new requirement for the CLI.

### tree-sitter native bindings
tree-sitter uses native (C) code via node-gyp or prebuild. This can cause installation issues on some platforms. Mitigation: use prebuilt binaries where available.

### Dynamic Python patterns
Code using metaclasses, `setattr`, dynamic imports, or other runtime tricks will not be correctly analyzed by pyright. Refactorings on such code may miss references or produce incorrect results. Mitigation: document this limitation, fail gracefully when pyright reports incomplete information.

### Import complexity
Python has many import styles (absolute, relative, aliased, wildcard, re-exports via `__init__.py`). Plus `if TYPE_CHECKING:` blocks, `from __future__ import annotations`, and `__all__` lists. The codegen layer must handle all of them. This is the highest implementation risk — covered extensively in the codegen unit tests (section 2) and the Move Function vertical slice (section 4).
