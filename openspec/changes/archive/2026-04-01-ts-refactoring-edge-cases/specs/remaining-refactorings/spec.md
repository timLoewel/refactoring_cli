## Remaining Refactorings — Fixture Coverage

This spec covers the remaining 50+ refactorings. They are grouped by shared concern. Each needs at minimum the fixtures listed. Some have known implementation gaps noted.

---

## Group A: Function Renaming / Declaration

### change-function-declaration
Renames a function and all call sites. Same issues as rename-variable.

**Missing fixtures:**
- `arrow-function.fixture.ts` — `const fn = () => {}` — current impl only finds FunctionDeclaration. Should either support arrow functions or document refusal.
- `function-expression.fixture.ts` — `const fn = function() {}`
- `multiple-call-sites.fixture.ts` — function called in different expressions (not just statements)
- `method-shorthand.fixture.ts` — `{ methodName() {} }` — does ts-morph rename handle method shorthands?
- `exported.fixture.ts` — `export function foo()` renamed
- `cross-scope-shadowed.fixture.ts` — two functions with same name in different scopes

**Implementation gap:** Only searches `FunctionDeclaration`. Arrow functions and function expressions in variables are not found.

---

## Group B: Parameterize / Parameter Operations

### parameterize-function
Adds a new parameter to a function and replaces a hardcoded value in the body with it.

**Missing fixtures:**
- `multiple-call-sites.fixture.ts` — function has N callers, all must be updated
- `default-value.fixture.ts` — new parameter has a default value
- `overloaded.fixture.ts` — function has overloads — all signatures must be updated
- `recursive.fixture.ts` — function calls itself — recursive call must be updated too
- `no-callers.fixture.ts` — function is never called (exported but no local callers) — parameterize should still work on the declaration

### remove-flag-argument
Removes a boolean flag parameter and creates two separate functions.

**Missing fixtures:**
- `true-branch.fixture.ts` / `false-branch.fixture.ts` — calls with `true` vs `false`
- `default-flag.fixture.ts` — flag has a default value
- `multiple-flags.fixture.ts` — function has two flag parameters
- `flag-used-in-condition.fixture.ts` — flag used in complex expression, not just `if (flag)`

### replace-parameter-with-query / replace-query-with-parameter
These are inverses of each other.

**replace-parameter-with-query missing fixtures:**
- `computed-value.fixture.ts` — parameter is computed from another parameter: `foo(x, x * 2)` → body computes `x * 2`
- `multiple-callers.fixture.ts` — all callers must drop the now-computed argument

**replace-query-with-parameter missing fixtures:**
- `with-side-effects.fixture.ts` — the query has side effects (calling it multiple times changes semantics)
- `method-call.fixture.ts` — the query is a method call on `this`

---

## Group C: Class Field Operations

### rename-field
Renames a class property and updates `this.field` accesses.

**Missing fixtures:**
- `inherited-field.fixture.ts` — renaming a field that's also defined in a superclass/subclass
- `private-field.fixture.ts` — `#privateField` syntax (private class field)
- `optional-chaining.fixture.ts` — `obj?.fieldName` access pattern
- `destructured.fixture.ts` — `const { field } = instance` — destructuring a class instance
- `interface-field.fixture.ts` — field declared in an interface that the class implements
- `multiple-instances.fixture.ts` — field accessed on different instances of the same class
- `computed-access.fixture.ts` — `obj['fieldName']` string-keyed access (cannot be renamed by AST)

**Implementation gap:** The current impl uses `expressionType.getSymbol()?.getName() === className` for cross-reference detection — but this requires type information. In simple in-memory projects this may not resolve types correctly.

### move-field
Moves a field from one class to another and updates all accesses.

**Missing fixtures:**
- `with-initializer.fixture.ts` — field has an initializer value
- `with-type.fixture.ts` — field has a type annotation
- `referenced-in-methods.fixture.ts` — field referenced inside the class's own methods
- `referenced-externally.fixture.ts` — field accessed from outside the class

### pull-up-field / push-down-field / pull-up-method / push-down-method

**Missing fixtures for each:**
- `with-type-annotation.fixture.ts` — field/method has type annotations
- `with-access-modifier.fixture.ts` — `public`/`protected`/`private` field
- `multiple-subclasses.fixture.ts` — pulling up from a class that has multiple subclasses
- `already-in-parent.fixture.ts` — field already exists in parent → precondition refusal
- `with-initializer.fixture.ts` — field has complex initializer

### encapsulate-record / encapsulate-collection / encapsulate-variable

**encapsulate-record missing fixtures:**
- `with-typed-fields.fixture.ts` — fields have explicit type annotations
- `with-initialized-fields.fixture.ts` — fields have initializers
- `with-private-fields.fixture.ts` — some fields already private (should be skipped)
- `with-methods.fixture.ts` — class already has methods alongside fields
- `with-readonly.fixture.ts` — `readonly` fields should not get setters

**encapsulate-collection missing fixtures:**
- `array-field.fixture.ts` — field is an array; add/remove/get methods
- `set-field.fixture.ts` — field is a Set
- `with-direct-mutation.fixture.ts` — external code pushes directly onto the array

**Implementation note:** `encapsulate-record` currently only handles classes; its precondition rejects variables but the description says "or variable". The apply returns failure for non-class targets.

### extract-class
Extracts fields into a new class.

**Missing fixtures:**
- `with-typed-fields.fixture.ts` — fields have type annotations
- `with-methods.fixture.ts` — some methods also reference the extracted fields (should they move too?)
- `with-initializers.fixture.ts` — fields have complex initializers
- `field-used-in-remaining-methods.fixture.ts` — the remaining class's methods access the moved fields (now need to go through the delegate)

---

## Group D: Hierarchy Refactorings

### extract-superclass / collapse-hierarchy

**extract-superclass missing fixtures:**
- `shared-methods.fixture.ts` — multiple classes share common methods
- `with-constructor.fixture.ts` — class has a constructor
- `with-abstract-methods.fixture.ts` — extracting to abstract class

**collapse-hierarchy missing fixtures:**
- `with-subclass-only-methods.fixture.ts` — subclass has methods not in parent
- `with-overrides.fixture.ts` — subclass overrides parent methods
- `with-constructor-args.fixture.ts` — different constructor signatures

### remove-subclass / replace-type-code-with-subclasses
These are inverses.

**remove-subclass missing fixtures:**
- `with-overridden-methods.fixture.ts` — subclass overrides methods → needs to inline those behaviors
- `with-subclass-only-fields.fixture.ts` — subclass has extra fields
- `with-multiple-subclasses.fixture.ts` — multiple subclasses of the same parent

**replace-type-code-with-subclasses missing fixtures:**
- `string-type-code.fixture.ts` — type code is a string enum
- `with-switch-statement.fixture.ts` — behavior varies via switch on type
- `with-factory-function.fixture.ts` — needs factory function for construction

### replace-subclass-with-delegate / replace-superclass-with-delegate

**Missing fixtures:**
- `with-multiple-methods.fixture.ts` — delegating N methods
- `with-state-in-subclass.fixture.ts` — subclass has its own state
- `with-constructor-delegation.fixture.ts` — constructor args pass-through

### pull-up-constructor-body

**Missing fixtures:**
- `with-field-initialization.fixture.ts` — constructor initializes fields
- `with-different-args.fixture.ts` — sub/super have different constructor signatures
- `with-super-call.fixture.ts` — constructor has existing `super()` call

---

## Group E: Conditional Refactorings

### consolidate-conditional-expression
Merges consecutive if statements with same body into one condition.

**Missing fixtures:**
- `or-conditions.fixture.ts` — `if (a) return x; if (b) return x;` → `if (a || b) return x;`
- `nested-conditions.fixture.ts` — nested ifs → `&&`
- `with-else-clauses.fixture.ts` — ifs have else branches
- `ternary-form.fixture.ts` — consolidating ternary expressions

### decompose-conditional

**Missing fixtures:**
- `with-else-branch.fixture.ts` — if-else → isCondition(), ifTrue(), ifFalse()
- `with-complex-condition.fixture.ts` — multi-part boolean expression
- `with-nested-ifs.fixture.ts` — nested if statements
- `with-early-return.fixture.ts` — early return in branch

### replace-nested-conditional-with-guard-clauses

**Missing fixtures:**
- `multiple-guards.fixture.ts` — multiple conditions to flip
- `with-complex-body.fixture.ts` — body after guards has multiple statements
- `with-else-block.fixture.ts` — original has else block that becomes the main path
- `already-flat.fixture.ts` — already flat code → precondition refusal

### replace-control-flag-with-break

**Missing fixtures:**
- `in-while-loop.fixture.ts` — control flag in while loop
- `in-for-loop.fixture.ts` — control flag in traditional for loop
- `with-multiple-exits.fixture.ts` — flag set at multiple points

### introduce-special-case

**Missing fixtures:**
- `null-check.fixture.ts` — special case for `null`
- `undefined-check.fixture.ts` — special case for `undefined`
- `with-multiple-callers.fixture.ts` — special case used in multiple places

---

## Group F: Loop / Pipeline

### split-loop

**Missing fixtures:**
- `two-accumulations.fixture.ts` — single loop computes two independent values
- `three-way-split.fixture.ts` — three independent computations
- `with-filter.fixture.ts` — loop has conditional push
- `with-side-effects.fixture.ts` — loop has side effects (cannot always split)
- `dependent-accumulations.fixture.ts` — computations depend on each other → should refuse split or warn

---

## Group G: Code Organization

### slide-statements

**Missing fixtures:**
- `move-forward.fixture.ts` — move statement earlier in block (to be near its usage)
- `move-backward.fixture.ts` — move statement later in block
- `inside-function.fixture.ts` — slide within a function body (current impl uses sf.getStatements() — only top-level; statements inside functions are NOT top-level)
- `dependency-violation.fixture.ts` — sliding a statement past a dependency (the result is invalid; should we warn?)

**Implementation gap:** `findStatementAtLine` uses `sf.getStatements()` — only top-level statements. Moving a statement inside a function body fails precondition with "No statement found at line X".

### split-phase

**Missing fixtures:**
- `with-shared-data.fixture.ts` — both phases need access to same data object
- `with-multiple-returns.fixture.ts` — the intermediate data has multiple fields
- `with-typed-intermediate.fixture.ts` — intermediate data object has explicit type

### combine-functions-into-class

**Missing fixtures:**
- `with-shared-data.fixture.ts` — functions share common data (should become class fields)
- `with-parameters.fixture.ts` — functions take the same first parameter
- `exported-functions.fixture.ts` — functions are exported → class must be exported
- `with-function-references.fixture.ts` — functions call each other

### combine-functions-into-transform

**Missing fixtures:**
- `multi-transform.fixture.ts` — multiple transformation steps
- `with-existing-data.fixture.ts` — transformation copies input data

### separate-query-from-modifier

**Missing fixtures:**
- `modifier-then-query.fixture.ts` — function modifies state AND returns value
- `with-conditional-mutation.fixture.ts` — mutation is conditional

### substitute-algorithm

**Missing fixtures:**
- `simpler-implementation.fixture.ts` — same behavior, simpler code
- `with-edge-cases.fixture.ts` — new algorithm handles edge cases same way

---

## Group H: Error Handling

### replace-error-code-with-exception / replace-exception-with-precheck

**replace-error-code-with-exception missing fixtures:**
- `null-return.fixture.ts` — function returns null on error → throws instead
- `negative-return.fixture.ts` — function returns -1 → throws
- `with-error-handling-callers.fixture.ts` — callers check the return code (they need updating too)

**replace-exception-with-precheck missing fixtures:**
- `try-catch-guard.fixture.ts` — wrap call in try-catch → add precondition check before
- `multiple-catch-clauses.fixture.ts` — function throws multiple exception types

---

## Group I: Value / Object Transformations

### replace-primitive-with-object / encapsulate-variable

**replace-primitive-with-object missing fixtures:**
- `with-multiple-uses.fixture.ts` — primitive used in many places
- `with-operations.fixture.ts` — operations on primitive should move to class methods
- `with-string.fixture.ts` — wrapping a string in a value object
- `with-boolean.fixture.ts` — wrapping a boolean flag

### change-reference-to-value / change-value-to-reference

**missing fixtures:**
- `with-equality-check.fixture.ts` — equality comparison behavior changes
- `with-shared-mutation.fixture.ts` — mutating the value affects other references (value→ref)
- `immutable-value.fixture.ts` — value is frozen/readonly

### return-modified-value

**Missing fixtures:**
- `with-chained-modification.fixture.ts` — multiple modifications before return
- `with-multiple-callers.fixture.ts` — all callers must handle return value

---

## Group J: Remove/Replace Operations

### remove-dead-code

**Missing fixtures:**
- `unreachable-after-return.fixture.ts` — code after `return`
- `always-false-condition.fixture.ts` — `if (false) { ... }`
- `unused-import.fixture.ts` — import that nothing uses

### remove-middle-man / hide-delegate

**remove-middle-man missing fixtures:**
- `multiple-delegating-methods.fixture.ts` — class has N methods that all forward to delegate
- `partial-delegation.fixture.ts` — some methods delegate, some don't

**hide-delegate missing fixtures:**
- `with-chained-access.fixture.ts` — `a.b.c` → hide `b`, callers go through `a.getC()`
- `with-type-narrowing.fixture.ts` — delegate field is a discriminated union

### remove-setting-method

**Missing fixtures:**
- `with-initializer-in-constructor.fixture.ts` — field set only in constructor
- `with-setter-validation.fixture.ts` — setter does validation → removing it loses validation
- `with-multiple-setters.fixture.ts` — multiple fields each have setters

---

## Group K: Command/Query Separation

### replace-function-with-command / replace-command-with-function

**replace-function-with-command missing fixtures:**
- `with-parameters-becoming-fields.fixture.ts` — function params become Command class fields
- `with-return-value.fixture.ts` — function returns value → Command's execute() must capture it

**replace-command-with-function missing fixtures:**
- `with-state.fixture.ts` — Command has state built up before execute()
- `with-multiple-execute-calls.fixture.ts` — Command executed multiple times

---

## Group L: Move Operations (Other)

### move-statements-into-function / move-statements-to-callers
Inverse pair.

**move-statements-into-function missing fixtures:**
- `multiple-callers.fixture.ts` — statements moved into a function called from N places
- `with-variable-leakage.fixture.ts` — moved statements declare variables used after

**move-statements-to-callers missing fixtures:**
- `multiple-callers.fixture.ts` — statements extracted out to N callers (replicated)
- `with-function-params.fixture.ts` — moved statements use function's parameters

### replace-inline-code-with-function-call

**Missing fixtures:**
- `exact-match.fixture.ts` — inline code matches function body exactly
- `with-variable-names.fixture.ts` — variable names differ but logic matches
- `multiple-occurrences.fixture.ts` — same inline pattern appears N times

---

## Group M: Split / Separate

### split-variable

**Missing fixtures:**
- `two-purposes.fixture.ts` — variable `temp` used for two completely different values
- `three-assignments.fixture.ts` — variable reassigned twice (3 segments)
- `const-variable.fixture.ts` — precondition rejection (const cannot be split)
- `with-compound-assignment.fixture.ts` — `temp += x` (compound assignment, not simple `=`)
- `references-between-segments.fixture.ts` — usage before first reassignment vs after

**Implementation concern:** Current impl renames all remaining references to `target1` (first segment) after processing reassignments. But references BETWEEN the first and second assignment should map to `target1`, references after second assignment to `target2`, etc. The current approach of renaming all remaining refs to `target1` is incorrect for the second segment's references.

---

## Group N: Introduce / Preserve

### introduce-parameter-object

**Missing fixtures:**
- `all-parameters.fixture.ts` — all params grouped (not just subset)
- `with-defaults.fixture.ts` — some params have default values
- `with-rest-param.fixture.ts` — function has rest parameter (shouldn't be grouped)
- `with-callers.fixture.ts` — all callers updated to pass object
- `with-typed-params.fixture.ts` — params have type annotations → object type inferred

### preserve-whole-object

**Missing fixtures:**
- `from-property-access.fixture.ts` — `foo(obj.a, obj.b)` → `foo(obj)`, access obj.a and obj.b inside
- `with-computed-values.fixture.ts` — `foo(obj.a, obj.b + 1)` — not a simple property pass-through
- `multiple-source-objects.fixture.ts` — params come from different objects

### introduce-assertion

**Missing fixtures:**
- `null-check.fixture.ts` — `if (x === null) throw`
- `range-check.fixture.ts` — `if (n < 0 || n > 100) throw`
- `type-guard.fixture.ts` — `if (typeof x !== 'string') throw`
- `with-message.fixture.ts` — custom error message
- `async-function.fixture.ts` — assertion added to async function

---

## Shared Implementation Patterns to Watch

**Functions-only search:** `change-function-declaration`, `decompose-conditional`, `combine-functions-into-class` all search only `FunctionDeclaration`. Arrow functions and function expressions in variables won't be found.

**Top-level only:** `slide-statements`, several others only operate on `sf.getStatements()`. Any refactoring that refers to statements by line number will fail silently if the target is inside a function body.

**Type inference missing:** `replace-temp-with-query` (hardcoded `: number`), some others that generate function signatures without type inference.

**Name collision not checked:** Several refactorings don't check if the new name conflicts with existing declarations in the target scope.

**Return type of void:** Several extractions hardcode `(): void` without checking if extracted code returns.
