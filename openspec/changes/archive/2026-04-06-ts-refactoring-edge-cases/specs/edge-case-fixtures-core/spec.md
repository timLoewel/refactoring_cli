## ADDED Requirements

### Requirement: Rename-variable edge-case fixtures
Each fixture SHALL be a `.fixture.ts` file in `src/refactorings/rename-variable/fixtures/` exporting `params` and a `main()` function. The suite SHALL cover: template literals, shorthand properties, arrow functions, scope shadowing, property-vs-variable disambiguation, for-of bindings, closure captures, typeof references, function parameters, computed properties, default parameters, export declarations, and let mutation.

#### Scenario: Shadowing does not rename inner scope
- **WHEN** `shadowing.fixture.ts` is run with rename-variable targeting the outer binding
- **THEN** only the outer-scope variable is renamed; the inner-scope binding with the same name is unchanged

#### Scenario: Property access is not renamed
- **WHEN** `property-vs-variable.fixture.ts` is run with rename-variable targeting a local variable
- **THEN** `obj.name` property accesses are not renamed, only the variable binding and its references

### Requirement: Inline-variable edge-case fixtures
The suite SHALL cover: multiple uses, operator precedence (parenthesization), side-effect initializers, single use, template literals, let declarations, computed initializers, and conditional contexts.

#### Scenario: Operator precedence wrapping
- **WHEN** `operator-precedence.fixture.ts` inlines `const sum = a + b` into `sum * 2`
- **THEN** the result is `(a + b) * 2` with parentheses added to preserve precedence

#### Scenario: Side-effect initializer with multiple uses
- **WHEN** `side-effect-initializer.fixture.ts` has an initializer with side effects used more than once
- **THEN** the refactoring SHALL refuse with a precondition error or warning

### Requirement: Extract-variable edge-case fixtures
The suite SHALL cover: repeated expressions, function call expressions, nested scope placement, string literals, object literals, conditional expressions, template literals, and partial-match ambiguity.

#### Scenario: Repeated expression replacement
- **WHEN** `repeated-expression.fixture.ts` extracts `items.length` used twice
- **THEN** both occurrences are replaced with the extracted variable

### Requirement: Inline-function edge-case fixtures
The suite SHALL cover: functions with parameters, return value inlining, single-expression arrows, multi-statement bodies, void functions with multiple call sites, calls in expressions, recursive rejection, method calls, default parameters, async functions, function expressions, template calls, and conditional calls.

#### Scenario: Recursive function rejection
- **WHEN** `recursive-reject.fixture.ts` attempts to inline a recursive function
- **THEN** the refactoring SHALL refuse with a precondition error

#### Scenario: Parameter substitution
- **WHEN** `with-parameters.fixture.ts` inlines a function with parameters
- **THEN** parameter names in the body are substituted with the call-site argument texts

### Requirement: Extract-function edge-case fixtures
The suite SHALL cover: outer variable reads becoming parameters, return value production, nested function body extraction, void side-effect extraction, async context, multiple escaping variables, loop break rejection, this-context, single expression extraction, and mutation of outer variables.

#### Scenario: Break inside extraction range is rejected
- **WHEN** `loop-break-reject.fixture.ts` attempts to extract a range containing `break`
- **THEN** the refactoring SHALL refuse with a precondition error

#### Scenario: Outer reads become parameters
- **WHEN** `reads-outer-variable.fixture.ts` extracts code that reads an outer-scope variable
- **THEN** the extracted function receives that variable as a parameter

### Requirement: Replace-temp-with-query edge-case fixtures
The suite SHALL cover: string, boolean, numeric, and array return types, multiple references, class method context, and outer-scope variable references becoming parameters.

#### Scenario: Return type inference
- **WHEN** `string-type.fixture.ts` replaces a string-initialized temp with a query
- **THEN** the generated function has return type `string`, not hardcoded `number`

### Requirement: Replace-loop-with-pipeline edge-case fixtures
The suite SHALL cover: map expressions, forEach for multi-statement bodies, destructuring loop variables, filter patterns, identity copies, for-in rejection, indexed-for rejection, nested loops, and break rejection.

#### Scenario: Filter pattern detection
- **WHEN** `filter-pattern.fixture.ts` has `if (pred) push(x)` in a for-of loop
- **THEN** the refactoring generates `.filter()` followed by appropriate chaining

#### Scenario: For-in loop rejection
- **WHEN** `for-in-rejection.fixture.ts` targets a for-in loop
- **THEN** the refactoring SHALL refuse with a precondition error

### Requirement: Move-function edge-case fixtures
The suite SHALL use multi-file fixture directories covering: zero-dependency moves, carrying imports, consumer import updates, export preservation, type imports, local references, JSDoc preservation, namespace imports, overloaded functions, and arrow functions.

#### Scenario: Consumer imports are rewritten
- **WHEN** `consumer-updates/` moves a function to a new file
- **THEN** all files that import the moved function have their import paths updated

#### Scenario: Overload signatures move together
- **WHEN** `overloaded/` moves an overloaded function
- **THEN** all overload signatures and the implementation move as a unit

### Requirement: Change-function-declaration edge-case fixtures
The suite SHALL cover: multiple call sites, exported functions, arrow function handling, recursive functions, and shadowed names.

#### Scenario: Recursive call is updated
- **WHEN** `recursive-function.fixture.ts` renames a recursive function
- **THEN** the recursive call site within the function body is also updated

### Requirement: Slide-statements edge-case fixtures
The suite SHALL cover: forward moves, backward moves, moves inside function bodies, and dependency violation behavior.

#### Scenario: Move inside function body
- **WHEN** `inside-function-body.fixture.ts` slides a statement within a function body
- **THEN** the statement is moved correctly, not limited to top-level statements

### Requirement: Split-variable edge-case fixtures
The suite SHALL cover: two-purpose variables, three-assignment variables, const rejection, compound assignments, and per-segment reference tracking.

#### Scenario: Per-segment reference tracking
- **WHEN** `segment-references.fixture.ts` splits a variable with multiple assignment segments
- **THEN** each segment's references are renamed to their respective new variable names, not all to `target1`

### Requirement: Rename-field edge-case fixtures
The suite SHALL cover: multiple instances, optional chaining, interface implementation, private modifiers, and inherited fields.

#### Scenario: Optional chaining is handled
- **WHEN** `optional-chaining.fixture.ts` renames a field accessed via `obj?.field`
- **THEN** the optional chaining access is renamed correctly
