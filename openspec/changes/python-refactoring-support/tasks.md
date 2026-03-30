## 1. Infrastructure

- [x] 1.1 Add `tree-sitter` and `tree-sitter-python` npm dependencies; verify parsing a simple Python file from TypeScript
- [x] 1.2 Build pyright LSP client: spawn `pyright-langserver --stdio`, implement initialize/shutdown lifecycle, and request helpers for `textDocument/references`, `textDocument/definition`, `textDocument/hover`, `textDocument/rename`. Include tests for: graceful shutdown on CLI exit, crash recovery (auto-restart on next request), initialization blocking (wait for project analysis before accepting queries)
- [x] 1.3 Build Python fixture runner: discover `.fixture.py` files, execute via Python subprocess, capture `main()` output, check semantic preservation (mirror TS fixture-runner.ts pattern). Create `all-python-fixtures.test.ts` parallel to `all-fixtures.test.ts` that discovers and runs all Python fixtures in the vitest suite
- [ ] 1.4 Build `definePythonRefactoring` builder and register Python refactorings in the shared registry with a `language: "python"` field on `RefactoringDefinition`
- [ ] 1.5 Extend CLI: add `--lang` flag, auto-detect language from file extension, route to correct refactoring implementation

## 2. Codegen layer with full import/annotation matrix

- [ ] 2.1 Build import statement generator: given a symbol name + its definition location (from pyright), produce the correct Python import statement
- [ ] 2.2 Unit tests for import generation — all import styles:
  - `import module`
  - `from module import name`
  - `from module import name as alias`
  - `import module as alias`
  - `from . import name` (relative)
  - `from .module import name` (relative)
  - Re-exports via `__init__.py`
  - `if TYPE_CHECKING:` import blocks — imports only for type checkers, not at runtime
  - `from __future__ import annotations` present — all annotations are strings
  - `__all__` list — verify codegen updates `__all__` when adding public symbols to a module
- [ ] 2.3 Build import merger: given a target file's existing imports + new imports to add, merge without duplicates
- [ ] 2.4 Unit tests for import merging:
  - Adding to existing `from X import a` → `from X import a, b`
  - No duplicate when import already exists
  - Correct grouping (stdlib / third-party / local) per PEP 8
  - Handling aliased imports alongside non-aliased
  - Merging into existing `if TYPE_CHECKING:` block when import is type-only
  - Preserving `from __future__ import annotations` as first import
- [ ] 2.5 Build annotation preservation: extract type references from source text, resolve each via pyright, determine which need imports
- [ ] 2.6 Unit tests for annotation handling:
  - `Optional[str]` → needs `from typing import Optional`
  - `str | None` → no import needed (PEP 604, Python 3.10+)
  - `list[int]` → no import needed (PEP 585, Python 3.9+)
  - `List[int]` → needs `from typing import List`
  - `Union[str, int]` → needs `from typing import Union`
  - `dict[str, Any]` → needs `from typing import Any`
  - Nested: `Optional[List[datetime]]` → needs `typing.Optional`, `typing.List`, `datetime.datetime`
  - Custom types: `def foo(x: MyClass)` → needs import for `MyClass`
  - No import for builtins: `str`, `int`, `float`, `bool`, `None`, `dict`, `list`, `tuple`, `set`, `bytes`, `type`
  - String annotations: `def foo(x: "MyClass")` — forward reference, still needs import
  - `from __future__ import annotations` — all annotations are strings, still need runtime imports if used at runtime, type-only imports go in `if TYPE_CHECKING:`
  - `TypeAlias`: `Vector: TypeAlias = list[float]`
  - `TypeVar`: `T = TypeVar("T", bound=Comparable)`

## 3. Vertical Slice 1 — Rename Variable (single-file)

- [ ] 3.1 Write Python fixtures (TDD — tests first, all should fail):
  - `basic.fixture.py` — simple variable rename
  - `typed.fixture.py` — variable with type annotation (`x: int = 42`)
  - `multiple-refs.fixture.py` — variable used in multiple expressions
  - `nested-scope.fixture.py` — same name in nested scope, only rename the target
  - `fstring.fixture.py` — variable referenced inside f-string (`f"value is {x}"`)
  - `walrus.fixture.py` — variable assigned via walrus operator (`if (n := len(a)) > 0:`)
  - `nonlocal.fixture.py` — variable declared `nonlocal` in a nested function
  - `comprehension-scope.fixture.py` — variable used in comprehension (comprehension has own scope in Python 3)
  - `tuple-unpack.fixture.py` — variable from tuple unpacking (`a, b = 1, 2`, rename `a`)
- [ ] 3.2 Implement `rename-variable` for Python using pyright `textDocument/rename`
- [ ] 3.3 All fixtures pass; commit
- [ ] 3.4 Run `roam health` / `roam diff`; refactor if needed; commit

## 4. Vertical Slice 2 — Move Function (multi-file)

- [ ] 4.1 Write Python fixtures covering import variants (TDD — tests first, all should fail):
  - `import-module/` — `import utils` → `utils.foo()`
  - `from-import/` — `from utils import foo`
  - `from-import-as/` — `from utils import foo as f`
  - `import-as/` — `import utils as u` → `u.foo()`
  - `relative-import/` — `from .utils import foo`
  - `reexport/` — `from utils import foo` via `__init__.py` re-export
  - `all-list/` — function listed in `__all__`, verify `__all__` is updated in source and target
  - `type-checking-import/` — moved function's type annotations only needed for type checking, uses `if TYPE_CHECKING:` block
  - `future-annotations/` — source file has `from __future__ import annotations`, verify correct handling
- [ ] 4.2 Write Python fixtures covering type annotation variants (TDD — tests first):
  - `no-annotations/` — `def foo(x, y): ...`
  - `basic-annotations/` — `def foo(x: int) -> str: ...`
  - `typing-imports/` — `Optional[List[str]]` requiring typing imports in target
  - `dataclass-field/` — function that takes a `@dataclass` parameter
  - `union-types/` — `str | int` (PEP 604) vs `Union[str, int]`
- [ ] 4.3 Write Python fixtures covering Python-specific gotchas:
  - `with-decorator/` — function has decorators (`@cache`, `@staticmethod`) — must move decorator too
  - `with-docstring/` — function has a docstring — must be preserved
  - `async-function/` — `async def` function, callers use `await`
  - `generator-function/` — function with `yield`, callers iterate over it
  - `default-mutable/` — function with mutable default arg `def foo(x=[])` — preserve as-is
  - `closure-dependency/` — function references a module-level variable from source file — must add import or parameter
- [ ] 4.4 Implement `move-function` for Python: pyright for references + definition, tree-sitter for extraction + insertion, codegen for import rewriting
- [ ] 4.5 All fixtures pass; commit
- [ ] 4.6 Run `roam health` / `roam diff`; refactor if needed; commit

## 5. Architecture Reflection Checkpoint

- [ ] 5.1 Evaluate: is pyright LSP latency acceptable? Measure round-trip times for references/rename on a non-trivial project
- [ ] 5.2 Evaluate: does tree-sitter edit model work for complex transformations? Identify pain points from move-function implementation
- [ ] 5.3 Evaluate: does the codegen layer handle all import/annotation variants? Review fixture results for edge cases
- [ ] 5.4 Evaluate: is `definePythonRefactoring` as a parallel builder the right call, or should the architecture change?
- [ ] 5.5 Decision: revise design.md and rewrite remaining tasks below if architectural changes are needed. If no changes needed, proceed.

## 6. Single-file refactorings

Each refactoring: basic fixture + typed fixture + Python edge case fixtures as listed. TDD cycle: write fixtures → implement → commit → roam check → commit.

- [ ] 6.1 `extract-variable`
  - basic — extract a repeated expression into a variable
  - typed — extracted expression has a known type, variable gets annotation
  - fstring — extract expression from inside f-string (`f"total: {a + b}"` → extract `a + b`)
  - walrus — extract from walrus operator context (`if (n := len(x)) > 0:`)
  - comprehension — extract expression from inside list comprehension (scoping: comprehension variables aren't visible outside)
  - chained-comparison — extract from `1 < x < 10` (Python-specific syntax)
  - ternary — extract from conditional expression `x if cond else y`

- [ ] 6.2 `inline-variable`
  - basic — inline a simple variable
  - typed — variable has type annotation; annotation is dropped when inlined
  - fstring — variable used in f-string; inlined value must be valid in f-string context
  - augmented-assign — variable used in augmented assignment (`x += 1`); should refuse (x is read+write)
  - tuple-unpack — variable from tuple unpacking (`a, b = foo()`); should refuse (can't inline one side)
  - multiple-assign — variable assigned multiple times; should refuse or only inline single-assignment case

- [ ] 6.3 `extract-function`
  - basic — extract statements into new function
  - typed — extracted code uses typed variables; generated signature needs type annotations for params and return
  - yield — extracted code contains `yield`; extracted function must be a generator (`def` not `return`)
  - async-await — extracted code contains `await`; extracted function must be `async def`
  - nonlocal — extracted code modifies a variable from enclosing scope; needs `nonlocal` or return-and-reassign pattern
  - indentation — extract from nested block (inside `if`/`for`/`with`); extracted code must be re-indented to top level
  - self-method — extract from inside a method; extracted function needs `self` parameter or becomes `@staticmethod`
  - decorator-context — extract from a function that has decorators; decorators stay on original, not extracted
  - closure — extracted code reads (but doesn't modify) variables from enclosing scope; they become parameters
  - multiple-returns — extracted code has multiple exit points (early return); needs careful control flow

- [ ] 6.4 `inline-function`
  - basic — inline a simple function at call site
  - typed — function has type-annotated params; annotations are dropped when inlined
  - decorator — function has decorators (`@cache`, `@staticmethod`); should refuse or warn (decorator behavior is lost)
  - generator — function has `yield`; cannot simply inline (changes semantics)
  - async — `async def` function; inlined code needs to stay in async context
  - args-kwargs — function uses `*args, **kwargs`; inlining at a specific call site must map actual arguments
  - default-args — function has default parameter values; inlined code must use defaults where caller didn't provide args
  - classmethod-staticmethod — `@classmethod` or `@staticmethod`; different `self`/`cls` handling

- [ ] 6.5 `rename-field`
  - basic — rename a plain class attribute
  - typed — rename a field with type annotation
  - dataclass — rename a dataclass field (affects auto-generated `__init__` parameter, keyword arguments at call sites)
  - namedtuple — rename a NamedTuple field (affects `.fieldname` access and index-based access)
  - property — rename a `@property` (must rename getter, `@name.setter`, `@name.deleter` together)
  - name-mangling — rename a `__private` field (callers outside class use `_ClassName__private`)
  - slots — rename a field declared in `__slots__`
  - typeddict — rename a TypedDict field (affects dict-style access `d["field"]` and attribute access)

- [ ] 6.6 `change-function-declaration`
  - basic — rename a function parameter
  - typed — parameter has type annotation that must be preserved/updated
  - positional-only — function uses `/` separator (PEP 570); respect positional-only semantics
  - keyword-only — function uses `*` separator (PEP 3102); new param placed correctly relative to separators
  - args-kwargs — function has `*args, **kwargs`; adding/removing params around these
  - overload — function has `@overload` variants; all overloads must be updated together
  - default-mutable — parameter has mutable default (`def foo(x=[])`); preserve the pattern

- [ ] 6.7 `slide-statements`
  - basic — slide a statement up or down
  - with-block — slide past a `with` statement (context manager scope boundary)
  - try-except — slide past `try`/`except`/`finally` blocks (can't slide into/out of exception handler)
  - yield — slide past `yield` in a generator (changes generator behavior)

- [ ] 6.8 `split-variable`
  - basic — split a variable that's reused for different purposes
  - typed — split variable may need different type annotations for each use
  - augmented-assign — `x = 0; x += 1; x = "hello"; x += " world"` — split at the type change
  - walrus — variable used in walrus operator and regular assignment

- [ ] 6.9 `split-loop`
  - basic — split a loop that does two things
  - comprehension — splitting won't apply to comprehensions (they're expressions, not loop bodies)
  - enumerate — loop uses `enumerate()`; both split loops need it
  - zip — loop uses `zip()`; both split loops need it

- [ ] 6.10 `replace-magic-literal`
  - basic — replace a magic number with a named constant
  - typed — extracted constant gets a `Final[int]` or `Final[str]` annotation
  - fstring — magic literal inside f-string
  - default-param — magic literal used as default parameter value
  - decorator-arg — magic literal in decorator argument (`@retry(max_attempts=3)`)
  - multiple-occurrences — same magic literal appears multiple times; replace all

- [ ] 6.11 `decompose-conditional`
  - basic — extract complex condition into named boolean variables/functions
  - match-case — decompose a `match`/`case` statement (Python 3.10+)
  - isinstance-chain — `isinstance(x, A) or isinstance(x, B)` → `isinstance(x, (A, B))`

- [ ] 6.12 `consolidate-conditional-expression`
  - basic — merge adjacent `if` blocks with same body
  - walrus — conditions use walrus operator; consolidated condition must preserve assignment

- [ ] 6.13 `replace-nested-conditional-with-guard-clauses`
  - basic — nested `if`/`else` → early returns
  - with-cleanup — nested conditional inside `try`/`finally` or `with`; guard clause can't bypass cleanup

- [ ] 6.14 `replace-control-flag-with-break`
  - basic — replace boolean flag controlling loop exit
  - for-else — Python's `for`/`else` construct (else runs if loop completes without `break`); `break` changes this semantics
  - nested-loop — flag controls outer loop; `break` only exits inner loop

- [ ] 6.15 `replace-temp-with-query`
  - basic — replace temp variable with function call
  - typed — extracted query function needs return type annotation
  - walrus — temp assigned via walrus operator

- [ ] 6.16 `substitute-algorithm`
  - basic — replace function body with a simpler algorithm
  - generator — function is a generator; replacement must also yield
  - async — async function; replacement must also be async

- [ ] 6.17 `remove-dead-code`
  - basic — remove unreachable code after `return`
  - typed — removed code has type annotations; verify clean removal
  - unused-import — remove unused imports (common Python dead code)
  - type-checking-block — `if TYPE_CHECKING:` block must NOT be removed (it's "dead" at runtime but needed for types)
  - all-export — code seems unused but is listed in `__all__`; must NOT be removed
  - pass-remainder — after removing dead code from a block, insert `pass` if block would be empty
  - ellipsis-body — `...` as function body (protocol/abstract); must NOT be removed

- [ ] 6.18 `introduce-assertion`
  - basic — add assertion for a condition
  - type-narrowing — assertion that narrows type (`assert isinstance(x, int)`); affects type checker

- [ ] 6.19 `replace-error-code-with-exception`
  - basic — function returns error code → raises exception
  - typed — return type changes (e.g., `int | None` → `int` with exception on error)
  - none-return — Python convention of returning `None` on error (more common than integer error codes)
  - custom-exception — may need to define a new exception class

- [ ] 6.20 `replace-exception-with-precheck`
  - basic — replace try/except with if-check before the operation
  - eafp-to-lbyl — Python idiom shift: "Easier to Ask Forgiveness" → "Look Before You Leap"
  - keyerror — `try: d[key]` → `if key in d:`
  - attributeerror — `try: obj.attr` → `if hasattr(obj, "attr"):`

- [ ] 6.21 `return-modified-value`
  - basic — function modifies a parameter in place → return the modified value instead
  - typed — return type annotation added/changed
  - mutable-arg — modifying a list/dict argument; return instead of mutate

- [ ] 6.22 `separate-query-from-modifier`
  - basic — split function that both reads and writes into two functions
  - typed — new query function needs return type annotation
  - property-setter — `@property` setter that also returns a value; split into setter + query method

- [ ] 6.23 `remove-flag-argument`
  - basic — replace boolean flag with two separate functions
  - typed — removed param has type annotation
  - keyword-default — flag is a keyword argument with default (`def foo(verbose=False)`)
  - enum-flag — flag is an enum value, not a boolean

- [ ] 6.24 `parameterize-function`
  - basic — merge similar functions into one parameterized function
  - typed — new parameter needs type annotation inferred from the merged literals/values
  - positional-keyword — decide if new param is positional-only, keyword-only, or either

- [ ] 6.25 `replace-parameter-with-query`
  - basic — remove parameter, compute its value inside the function
  - typed — removed param had type annotation; internal query must produce same type
  - default-arg — parameter had a default value; query must handle the default case

- [ ] 6.26 `replace-query-with-parameter`
  - basic — replace internal computation with a parameter
  - typed — new param gets type annotation from the query's return type
  - positional-keyword — new param placement respects `/` and `*` separators

- [ ] 6.27 `preserve-whole-object`
  - basic — replace multiple parameters extracted from an object with the whole object
  - typed — parameter type changes from primitives to the object's class type
  - dataclass — object is a dataclass; parameter type is the dataclass class
  - namedtuple — object is a NamedTuple

- [ ] 6.28 `replace-command-with-function`
  - basic — replace a class with a single method with a standalone function
  - typed — class fields with type annotations → function params with annotations
  - callable-class — class with `__call__` method → function (Python-specific command pattern)
  - init-fields — class stores state in `__init__`; must become function parameters

- [ ] 6.29 `replace-function-with-command`
  - basic — replace a function with a class that has an `execute`/`__call__` method
  - typed — function params → class fields with type annotations; return type → method return type
  - closure-state — function uses closure variables; they become instance fields
  - dataclass-command — generated class could be a `@dataclass` for conciseness

## 7. Encapsulation refactorings (Python-specific patterns)

Each: basic + typed + Python-idiom-specific + cross-file fixtures. TDD cycle per refactoring.

- [ ] 7.1 `encapsulate-variable`
  - basic — module-level variable → getter/setter functions
  - typed — variable with type annotation; getter return type and setter param type
  - property — class attribute → `@property` with `@name.setter`
  - name-mangling — encapsulate `__private` attribute (callers outside class use mangled name)
  - slots — attribute declared in `__slots__`; `@property` needs `__slots__` update
  - cross-file — external modules access the variable; imports updated to use getter/setter

- [ ] 7.2 `encapsulate-record`
  - basic — plain dict with known keys → class with accessors
  - typed — dict with type comments or TypedDict → dataclass with typed fields
  - typeddict-to-dataclass — `TypedDict` → `@dataclass` (different runtime semantics)
  - namedtuple-to-dataclass — `NamedTuple` → `@dataclass` (gains mutability)
  - dict-access-patterns — callers use `d["key"]`, `d.get("key")`, `d.get("key", default)`; all must be rewritten
  - cross-file — record is used across files; imports updated

- [ ] 7.3 `encapsulate-collection`
  - basic — expose add/remove/iterator instead of raw collection
  - typed — collection has type annotation (`list[Item]`); accessor types derived from it
  - frozen-return — getter returns a copy or `tuple()` to prevent mutation
  - cross-file — callers in other files updated to use accessors

- [ ] 7.4 `replace-primitive-with-object`
  - basic — replace a `str` or `int` with a value object class
  - typed — type annotations change from primitive to new class
  - dataclass-value — new value object is a `@dataclass(frozen=True)`
  - cross-file — callers' type annotations and constructors updated

## 8. Multi-file refactorings (beyond move-function)

Each: basic + typed + cross-file + Python edge case fixtures. TDD cycle per refactoring.

- [ ] 8.1 `move-field`
  - basic — move a field from one class to another
  - typed — field has type annotation; preserved in target class
  - cross-file — callers' imports updated
  - property-field — field is a `@property`; move getter/setter/deleter together
  - dataclass-field — field on a `@dataclass`; affects auto-generated `__init__`
  - slots-field — field in `__slots__`; source and target `__slots__` updated

- [ ] 8.2 `move-statements-into-function`
  - basic — move repeated statements at call sites into the function body
  - typed — moved statements reference typed variables
  - cross-file — statements moved from callers in different files
  - indentation — statements at different nesting levels in callers; re-indented when moved into function

- [ ] 8.3 `move-statements-to-callers`
  - basic — move statements from function body to each call site
  - typed — moved statements have type-annotated variables
  - cross-file — callers in different files receive the statements
  - indentation — moved statements must match the indentation level at each call site

- [ ] 8.4 `inline-class`
  - basic — merge a class into the class that uses it
  - typed — fields with type annotations merge into target
  - cross-file — all imports of the removed class rewritten
  - all-update — removed class listed in `__all__`; update `__all__`
  - init-merge — `__init__` bodies must be merged correctly
  - decorator-class — class has decorators (`@dataclass`); decorators don't transfer

- [ ] 8.5 `extract-class`
  - basic — extract some fields/methods into a new class
  - typed — extracted fields keep their type annotations
  - cross-file — callers get new import for extracted class
  - all-update — new class added to `__all__` if source class was in `__all__`
  - circular-import — extracted class references source class → `if TYPE_CHECKING:` import to avoid circular import
  - dataclass — extracting from a `@dataclass`; extracted class may also be a `@dataclass`

- [ ] 8.6 `hide-delegate`
  - basic — add delegating method to hide the delegate
  - typed — delegating method needs correct type annotations (return type from delegate's method)
  - cross-file — callers' chain access (`a.delegate.method()`) becomes `a.method()`; cross-file update

- [ ] 8.7 `remove-middle-man`
  - basic — remove delegating method, expose delegate directly
  - typed — caller now accesses delegate; type annotations at call sites may change
  - cross-file — callers updated to access delegate directly

- [ ] 8.8 `replace-inline-code-with-function-call`
  - basic — replace inline code with a call to an existing function
  - typed — function's parameter/return types must match the inline code's types
  - cross-file — need to add import for the function being called

- [ ] 8.9 `introduce-parameter-object`
  - basic — group parameters into an object
  - typed — params with annotations → dataclass fields with annotations
  - cross-file — callers import the new dataclass
  - namedtuple-variant — generate NamedTuple instead of dataclass (immutable parameter group)
  - keyword-args — callers using keyword arguments must switch to constructing the parameter object

- [ ] 8.10 `introduce-special-case`
  - basic — replace conditional null/special checks with a special case object
  - typed — special case class has same interface (Protocol or subclass) with correct type annotations
  - cross-file — callers that checked for None/null now work with special case object
  - none-pattern — Python's `None` check pattern (`if x is None:`) is the most common trigger

- [ ] 8.11 `combine-functions-into-class`
  - basic — group related functions into a class with methods
  - typed — function param/return types become method signatures; shared data becomes typed fields
  - cross-file — callers import new class instead of individual functions
  - self-param — all functions gain `self` parameter; first argument of functions that operated on shared data becomes `self.field`
  - init-generation — `__init__` must be generated from shared state across the functions

- [ ] 8.12 `combine-functions-into-transform`
  - basic — group functions into a pipeline that enriches an input record
  - typed — input record type annotations preserved through transform
  - cross-file — callers updated to use transform function

## 9. Class hierarchy refactorings

Each: basic + typed + inheritance-specific + Python edge case fixtures. TDD cycle per refactoring.

- [ ] 9.1 `replace-constructor-with-factory-function`
  - basic — `__init__` direct call → factory function
  - typed — factory function return type annotation is the class type
  - classmethod-factory — Python idiom: `@classmethod` factory instead of standalone function
  - subclass — factory on base class must return correct subclass type (return type is `Self` or `cls`)
  - new-vs-init — class overrides `__new__`; factory must handle `__new__` semantics

- [ ] 9.2 `pull-up-method`
  - basic — move method from subclass to parent
  - typed — method with typed params moves to parent; type annotations preserved
  - super-chain — method calls `super().method()`; after pull-up, super target changes
  - abstract — pulled-up method may become `@abstractmethod` if other subclasses have different implementations
  - self-attributes — method uses `self.x` where `x` only exists on subclass; must add attribute to parent or make abstract
  - multiple-subclasses — same method in multiple subclasses; verify all subclasses' copies are identical before pulling up

- [ ] 9.3 `pull-up-field`
  - basic — move field from subclass to parent
  - typed — field annotation moves to parent
  - multiple-subclasses — field exists in multiple subclasses; all must have same type
  - init-field — field assigned in `__init__`; parent's `__init__` must be updated
  - dataclass-field — field on `@dataclass` subclass → parent dataclass
  - slots — field in subclass `__slots__` → parent `__slots__`

- [ ] 9.4 `pull-up-constructor-body`
  - basic — move shared `__init__` code to parent class
  - typed — parameters with type annotations preserved in parent `__init__`
  - super-init — verify `super().__init__()` call ordering (Python executes in call order, not declaration order)
  - args-forwarding — `*args, **kwargs` forwarding in `__init__` chain
  - dataclass-init — `@dataclass` generates `__init__`; can't manually pull up (should refuse or convert to non-dataclass)
  - field-assignment — `self.x = x` assignments must move correctly

- [ ] 9.5 `push-down-method`
  - basic — move method from parent to subclass(es) that use it
  - typed — method type annotations preserved
  - single-subclass — method used by only one subclass; push to that one
  - abstract-removal — if method was `@abstractmethod`, remove abstract decorator after push-down
  - super-callers — other methods calling `super().method()` must be updated

- [ ] 9.6 `push-down-field`
  - basic — move field from parent to subclass(es) that use it
  - typed — field annotation preserved
  - single-subclass — field used by only one subclass
  - init-update — parent `__init__` field assignment moves to subclass `__init__`
  - dataclass-field — field on parent `@dataclass` → subclass dataclass
  - slots — field in parent `__slots__` → subclass `__slots__`

- [ ] 9.7 `extract-superclass`
  - basic — create a new base class from shared members of existing classes
  - typed — shared fields/methods keep type annotations in new superclass
  - cross-file — new file for superclass; imports updated in existing classes and their callers
  - abc — extracted superclass should be `ABC` with `@abstractmethod` for methods not shared by all classes
  - init-subclass — `__init_subclass__` hook; extracted superclass may need one
  - slots — `__slots__` in superclass and subclasses must be coordinated (subclass `__slots__` should only have new fields)
  - mro — verify MRO is correct after extraction (no conflicts)

- [ ] 9.8 `collapse-hierarchy`
  - basic — merge subclass into parent (when subclass adds nothing)
  - typed — subclass type annotations merged into parent
  - cross-file — imports of removed subclass rewritten to parent
  - all-update — `__all__` updated if subclass was exported
  - isinstance — `isinstance(x, Subclass)` checks must be updated to `isinstance(x, Parent)`

- [ ] 9.9 `remove-subclass`
  - basic — replace subclass with parent using fields to distinguish
  - typed — type annotations referencing subclass changed to parent
  - cross-file — imports updated
  - isinstance — `isinstance()` checks rewritten to field checks
  - factory — creation sites changed from `Subclass()` to `Parent(type=...)`

- [ ] 9.10 `replace-type-code-with-subclasses`
  - basic — enum/string type code → subclass hierarchy
  - typed — type annotations change from `str`/enum to base class type
  - cross-file — callers import subclasses or factory
  - enum — Python `Enum` → subclasses (specific to Python)
  - match-case — `match`/`case` on type code must be updated to use `isinstance` or polymorphism
  - string-constants — string constants used as type code (common Python pattern)

- [ ] 9.11 `replace-subclass-with-delegate`
  - basic — replace inheritance with delegation
  - typed — delegate field needs type annotation
  - cross-file — delegate class may be in new file; imports updated
  - abstract-methods — `@abstractmethod` implementations become delegate methods
  - super-calls — `super()` calls in subclass replaced with delegate calls

- [ ] 9.12 `replace-superclass-with-delegate`
  - basic — replace inheritance from parent with delegation to it
  - typed — delegate field needs type annotation; forwarding methods need annotations
  - cross-file — imports may change
  - protocol — class may now satisfy a `Protocol` instead of inheriting (Python structural typing)
  - init — `super().__init__()` becomes `self._delegate = Parent()`

- [ ] 9.13 `replace-conditional-with-polymorphism`
  - basic — replace if/elif chain with subclass methods
  - typed — conditional branches become typed subclass methods
  - cross-file — subclasses may be in new files
  - isinstance-chain — `if isinstance(x, A): ... elif isinstance(x, B): ...` → polymorphic method dispatch
  - match-case — `match`/`case` (Python 3.10+) → polymorphism
  - dict-dispatch — Python idiom: dict mapping type codes to functions → polymorphism

## 10. Python-specific adaptations

Each: idiom-specific fixtures. TDD cycle per refactoring.

- [ ] 10.1 `replace-loop-with-pipeline`
  - basic-comprehension — for-loop appending to list → list comprehension
  - generator — for-loop → generator expression (lazy evaluation)
  - nested — nested for-loops → nested comprehension
  - filter — loop with `if` continue → comprehension with `if` clause
  - map — loop applying transformation → `map()` or comprehension
  - break-bail — loop with `break`; cannot use comprehension (should refuse or use `next()` with generator)
  - side-effects — loop body has side effects beyond building result; should refuse
  - enumerate — loop uses `enumerate()`; comprehension with enumerate
  - zip — loop uses `zip()`; comprehension with zip
  - dict-comprehension — loop building a dict → dict comprehension
  - set-comprehension — loop building a set → set comprehension
  - reduce — loop accumulating a single value → `functools.reduce()` (or warn: often less readable)

- [ ] 10.2 `change-reference-to-value`
  - basic — mutable object → immutable equivalent
  - dataclass-frozen — mutable `@dataclass` → `@dataclass(frozen=True)`
  - list-to-tuple — `list` → `tuple` (type annotations change too)
  - typed — all type annotations updated (`list[int]` → `tuple[int, ...]`)
  - eq-hash — frozen dataclass gets `__eq__` and `__hash__` for free; verify behavior preserved
  - dict-to-frozenset — `dict` used as record → `frozenset` of items (rare but valid)

- [ ] 10.3 `change-value-to-reference`
  - basic — multiple copies of same value object → shared reference
  - typed — type annotations preserved
  - registry — Python pattern: module-level registry dict or `functools.lru_cache` for instance sharing

- [ ] 10.4 `replace-derived-variable-with-query`
  - basic — cached computed value → `@property`
  - cached-property — cached computed value → `@cached_property` (Python 3.8+)
  - typed — property needs return type annotation
  - slots — class uses `__slots__`; `@cached_property` needs `__dict__` in slots or won't work

- [ ] 10.5 `remove-setting-method`
  - basic — remove setter, assign only in `__init__`
  - property-readonly — remove `@x.setter` from a `@property`, making it read-only
  - final-field — annotate field as `Final[int]` (from typing)
  - dataclass — dataclass field → `field(init=True)` with no setter (or `frozen=True` on class)

- [ ] 10.6 `split-phase`
  - basic — split a function into two sequential phases
  - typed — intermediate data structure between phases has type annotations
  - cross-file — intermediate data structure is a new dataclass in a new file
  - dataclass-intermediate — generate a `@dataclass` for the intermediate data

## 11. Cross-cutting edge case fixtures

These edge cases affect many refactorings and should be tested once per affected category rather than in every single refactoring.

- [ ] 11.1 `future-annotations` — test with `from __future__ import annotations` active for: extract-function, move-function, extract-class, pull-up-method (representative sample). Verify that string-ified annotations are handled correctly when moved.
- [ ] 11.2 `type-checking-blocks` — test with `if TYPE_CHECKING:` imports for: move-function, extract-class, inline-class. Verify type-only imports land in `if TYPE_CHECKING:` block in target, not in runtime imports.
- [ ] 11.3 `async-variants` — test async versions of: extract-function (→ `async def`), inline-function (preserve `await`), move-function (`async def` with `await`), substitute-algorithm (generator → async generator)
- [ ] 11.4 `decorator-preservation` — test that decorators survive: move-function, pull-up-method, push-down-method, rename-field (property decorators). Decorators must move with the decorated item.
- [ ] 11.5 `docstring-preservation` — test that docstrings survive: move-function, extract-function, pull-up-method, extract-class. Docstrings must remain as first statement of the moved item.
- [ ] 11.6 `name-mangling` — test `__private` attribute handling for: rename-field, move-field, encapsulate-variable, pull-up-field. Verify both the declaration and all mangled access sites (`_ClassName__field`) are updated.
- [ ] 11.7 `all-list-maintenance` — test `__all__` updates for: move-function, extract-class, inline-class, collapse-hierarchy, remove-subclass. Verify `__all__` is updated in both source and target modules.

## 12. Skipped refactorings (with rationale)

No refactorings are currently skipped — all 66 have been mapped. The architecture checkpoint (section 5) may identify some that should be dropped based on implementation findings.
