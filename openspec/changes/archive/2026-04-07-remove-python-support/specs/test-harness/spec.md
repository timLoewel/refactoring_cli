## REMOVED Requirements

### Requirement: Python parser singleton lifecycle
**Reason**: Python support removed. tree-sitter Python parser is no longer used.
**Migration**: Delete `src/python/tree-sitter-parser.ts`, its test, and all `afterAll` parser cleanup hooks. Remove `tree-sitter` and `tree-sitter-python` dependencies.

### Requirement: Python fixture runner
**Reason**: Python support removed. Python fixtures and the runner that discovers/executes them are no longer needed.
**Migration**: Delete `src/testing/python-fixture-runner.ts`, `src/testing/__tests__/python-fixture-runner.test.ts`, `src/refactorings/__tests__/all-python-fixtures.test.ts`, `src/refactorings/rename-variable/__tests__/python-rename.test.ts`, and all `.fixture.py` / `.py` fixture files.
