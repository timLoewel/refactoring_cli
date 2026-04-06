## Python Code Generation

### Requirements

- MUST generate valid Python import statements for types referenced in moved/extracted code
- MUST handle all import styles:
  - `import module`
  - `from module import name`
  - `from module import name as alias`
  - `import module as alias`
  - `from . import name` (relative)
  - `from .module import name` (relative)
  - Re-exports via `__init__.py`
- MUST merge new imports with existing imports in the target file without creating duplicates
  - Adding to existing `from X import a` produces `from X import a, b`
  - No duplicate when import already exists
  - Handles aliased imports alongside non-aliased
- MUST preserve the annotation syntax used in source code (`Optional[str]` stays as-is, `str | None` stays as-is)
- MUST resolve where a type is defined using pyright `textDocument/definition` to generate correct import paths
- MUST NOT generate imports for builtins (`str`, `int`, `float`, `bool`, `list`, `dict`, `tuple`, `set`, `bytes`, `None`, `type`)
- MUST correctly handle typing module variants:
  - `Optional[str]` → needs `from typing import Optional`
  - `str | None` → no import (PEP 604, Python 3.10+)
  - `list[int]` → no import (PEP 585, Python 3.9+)
  - `List[int]` → needs `from typing import List`
  - `Union[str, int]` → needs `from typing import Union`
  - Nested generics: `Optional[List[datetime]]` → needs all constituent imports
- SHOULD group imports following PEP 8 convention (stdlib, third-party, local) when inserting new imports

### Testing strategy

The codegen layer is tested exhaustively via unit tests (section 2 of tasks). Individual refactorings in later sections verify they integrate with the codegen layer correctly via a "typed fixture" (annotation preservation) and "cross-file fixture" (import rewriting) per refactoring, rather than repeating the full import/annotation matrix.
