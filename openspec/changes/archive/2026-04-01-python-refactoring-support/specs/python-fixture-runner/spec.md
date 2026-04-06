## Python Fixture Runner

### Requirements

- MUST discover `.fixture.py` files following the same convention as TS fixtures (single-file and multi-file/directory)
- MUST execute Python fixtures via subprocess (`python3 -c` or `python3 <file>`)
- MUST capture return value of `main()` function as the semantic output
- MUST verify semantic preservation: output before refactoring == output after refactoring
- MUST verify structural change: source text changed (not a no-op)
- MUST support multi-file fixtures as directories containing `entry.py` and supporting modules
- MUST run within the existing vitest test suite (all-python-fixtures.test.ts parallel to all-fixtures.test.ts)
- Fixture `.py` files MUST export params as a module-level `params` dict for the test runner to read
