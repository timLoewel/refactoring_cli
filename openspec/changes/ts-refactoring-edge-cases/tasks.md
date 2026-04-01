## 1. Rename Variable (TDD)

- [x] 1.1 Write fixtures (tests first — most should pass, ts-morph handles them):
  - `template-literal.fixture.ts` — variable in `${}`
  - `shorthand-property.fixture.ts` — `{ name }` shorthand expansion
  - `arrow-function.fixture.ts` — variable holds an arrow function
  - `shadowing.fixture.ts` — same name in nested scopes, rename only outer
  - `property-vs-variable.fixture.ts` — don't rename `obj.name` property access
  - `for-of-variable.fixture.ts` — loop binding variable
  - `closure-capture.fixture.ts` — captured in nested function
  - `typeof-reference.fixture.ts` — in `type T = typeof x` position
  - `function-parameter.fixture.ts` — rename a function parameter
  - `computed-property.fixture.ts` — `obj[key]` usage
  - `default-parameter.fixture.ts` — variable as default arg
  - `export-declaration.fixture.ts` — `export const x`
  - `let-mutation.fixture.ts` — `let` variable reassigned multiple times
- [x] 1.2 Run tests, fix any failures (expected: `function-parameter` needs impl broadening to ParameterDeclaration)
- [x] 1.3 Commit

## 2. Inline Variable (TDD)

- [x] 2.1 Write fixtures:
  - `used-multiple-times.fixture.ts` — variable used N times, all replaced
  - `operator-precedence.fixture.ts` — `const sum = a + b; sum * 2` → needs `(a + b) * 2`
  - `side-effect-initializer.fixture.ts` — `getRandom()` initializer, used 2×
  - `used-once.fixture.ts` — single reference
  - `used-in-template.fixture.ts` — inside template literal
  - `let-variable.fixture.ts` — `let` declaration
  - `computed-initializer.fixture.ts` — `part / total` inlined into `.toFixed()` chain
  - `in-condition.fixture.ts` — inlined into if condition
- [x] 2.2 Run tests — expected failures: operator-precedence (wrapping bug), side-effect (semantic change)
- [x] 2.3 Fix: wrap initializer in parens when inlining into higher-precedence context
- [x] 2.4 Fix: add precondition/warning when initializer has side effects and used > once
- [x] 2.5 All fixtures pass; commit

## 3. Extract Variable (TDD)

- [x] 3.1 Write fixtures:
  - `repeated-expression.fixture.ts` — extract `items.length` used twice
  - `function-call-expression.fixture.ts` — extract `Math.max(a, b)`
  - `nested-scope.fixture.ts` — expression only in inner scope
  - `string-literal.fixture.ts` — extract repeated magic string
  - `object-literal.fixture.ts` — extract repeated object literal
  - `conditional-expression.fixture.ts` — extract ternary
  - `template-literal.fixture.ts` — extract template expression
  - `partial-match.fixture.ts` — `a + b` inside `a + b + c` (ambiguity test)
- [x] 3.2 Run tests, fix any failures
- [x] 3.3 Commit

## 4. Inline Function (TDD)

- [ ] 4.1 Write fixtures:
  - `with-parameters.fixture.ts` — fn takes params, body uses them
  - `return-value-used.fixture.ts` — `const x = fn()`
  - `single-expression-arrow.fixture.ts` — arrow fn expression body
  - `multi-statement-body.fixture.ts` — multi-statement body (refusal or inline)
  - `void-multiple-call-sites.fixture.ts` — void fn with params, N call sites
  - `call-in-expression.fixture.ts` — `fn() + 1`
  - `recursive-reject.fixture.ts` — recursive function → precondition error
  - `method-call.fixture.ts` — used as direct call AND method
  - `with-default-parameters.fixture.ts` — default param values
  - `async-function.fixture.ts` — async fn with await
  - `function-expression.fixture.ts` — `const fn = function() {}`
  - `call-in-template.fixture.ts` — `` `${fn()}` ``
  - `call-in-conditional.fixture.ts` — `if (fn())`
- [ ] 4.2 Fix: never remove function if any call site was not inlined
- [ ] 4.3 Fix: parameter substitution (map param names → call argument texts)
- [ ] 4.4 Fix: return value inlining (single `return <expr>` body → inline as expression)
- [ ] 4.5 Fix: support arrow functions and function expressions (not just FunctionDeclaration)
- [ ] 4.6 Fix: preconditions — recursive, generator, unhandleable call sites
- [ ] 4.7 All fixtures pass; commit

## 5. Extract Function (TDD)

- [ ] 5.1 Write fixtures:
  - `reads-outer-variable.fixture.ts` — extracted code reads outer-scope var → parameter
  - `produces-return-value.fixture.ts` — extracted var used after range
  - `inside-function-body.fixture.ts` — extract from within a function body
  - `void-side-effects.fixture.ts` — void extraction with outer refs
  - `async-context.fixture.ts` — extracting `await` expressions
  - `multiple-variables-escape.fixture.ts` — N vars used after range
  - `loop-break-reject.fixture.ts` — `break` inside range → precondition error
  - `this-context.fixture.ts` — extracted code uses `this`
  - `single-expression.fixture.ts` — extract a complex expression statement
  - `mutation-of-outer.fixture.ts` — `let` variable modified in range
- [ ] 5.2 Fix: nested statement extraction (walk descendants, not just sf.getStatements())
- [ ] 5.3 Fix: scope analysis (outer reads → params, inner escapes → return value)
- [ ] 5.4 Fix: async detection, preconditions for break/continue/yield
- [ ] 5.5 Fix: multi-value return (destructuring)
- [ ] 5.6 All fixtures pass; commit

## 6. Replace Temp With Query (TDD)

- [ ] 6.1 Write fixtures:
  - `string-type.fixture.ts` — string initializer → `(): string`
  - `boolean-type.fixture.ts` — boolean initializer → `(): boolean`
  - `numeric-type.fixture.ts` — number initializer (existing behavior)
  - `array-type.fixture.ts` — array initializer → `(): number[]`
  - `multiple-references.fixture.ts` — temp used twice
  - `in-class-method.fixture.ts` — temp inside a method
  - `with-outer-scope-reference.fixture.ts` — initializer uses outer-scope vars
- [ ] 6.2 Fix: return type inference (use ts-morph type checker, not hardcoded `number`)
- [ ] 6.3 Fix: outer scope variables → parameters (same as extract-function)
- [ ] 6.4 Fix: update call sites when parameters are added
- [ ] 6.5 All fixtures pass; commit

## 7. Replace Loop With Pipeline (TDD)

- [ ] 7.1 Write fixtures:
  - `map-expression.fixture.ts` — non-trivial mapping expression
  - `foreach-multiple-statements.fixture.ts` — multi-statement body → `.forEach()`
  - `destructuring-loop-var.fixture.ts` — `for (const { a, b } of ...)`
  - `filter-pattern.fixture.ts` — `if (pred) push(x)` → `.filter()`
  - `identity-copy.fixture.ts` — `push(item)` → spread
  - `for-in-rejection.fixture.ts` — for-in loop → precondition error
  - `indexed-for-rejection.fixture.ts` — traditional for → precondition error
  - `nested-loop.fixture.ts` — target inner loop specifically
  - `loop-with-break-rejection.fixture.ts` — break in body → precondition error
- [ ] 7.2 Fix: detect filter pattern → generate `.filter()`
- [ ] 7.3 Fix: detect `break`/`continue` in body → refuse
- [ ] 7.4 All fixtures pass; commit

## 8. Move Function (TDD)

- [ ] 8.1 Write multi-file fixtures:
  - `no-deps/` — zero-dependency move (validate multi-file infra)
  - `carries-imports/` — fn uses imported symbol
  - `consumer-updates/` — other files import the moved fn
  - `preserves-export/` — export modifier preserved
  - `with-type-imports/` — fn uses `import type`
  - `references-local/` — fn references module-level constant
  - `with-jsdoc/` — JSDoc preserved
  - `namespace-import/` — fn uses `import * as ns`
  - `overloaded/` — overload signatures move together
  - `arrow-function/` — const arrow fn (refusal or support)
- [ ] 8.2 Fix: import analysis + carrying to destination
- [ ] 8.3 Fix: consumer import rewriting
- [ ] 8.4 Fix: export preservation, local reference handling
- [ ] 8.5 Fix: overload support, JSDoc via getFullText()
- [ ] 8.6 All fixtures pass; commit

## 9. Change Function Declaration (TDD)

- [ ] 9.1 Write fixtures:
  - `multiple-call-sites.fixture.ts` — function called in multiple expressions
  - `exported-function.fixture.ts` — `export function foo()`
  - `arrow-function-reject.fixture.ts` — `const fn = () => {}` → precondition error or support
  - `recursive-function.fixture.ts` — function calls itself, recursive call updated
  - `shadowed-name.fixture.ts` — another function/variable has same name in inner scope
- [ ] 9.2 Fix or document: arrow function support
- [ ] 9.3 Commit

## 10. Slide Statements (TDD)

- [ ] 10.1 Write fixtures:
  - `move-forward.fixture.ts` — move statement to earlier position
  - `move-backward.fixture.ts` — move statement to later position
  - `inside-function-body.fixture.ts` — move within function body (not top-level)
  - `dependency-violation.fixture.ts` — move past a dependency (document behavior)
- [ ] 10.2 Fix: `findStatementAtLine` should work inside function bodies, not just top-level
- [ ] 10.3 Commit

## 11. Split Variable (TDD)

- [ ] 11.1 Write fixtures:
  - `two-purposes.fixture.ts` — variable used for two different roles
  - `three-assignments.fixture.ts` — variable reassigned twice (3 segments)
  - `const-reject.fixture.ts` — `const` variable → precondition error
  - `compound-assignment.fixture.ts` — `temp += x` pattern
  - `segment-references.fixture.ts` — verify each segment's references are renamed correctly
- [ ] 11.2 Fix: reference-per-segment tracking (current impl renames all to `target1`)
- [ ] 11.3 Commit

## 12. Rename Field (TDD)

- [ ] 12.1 Write fixtures:
  - `multiple-instances.fixture.ts` — field accessed on multiple instances
  - `optional-chaining.fixture.ts` — `obj?.field` access
  - `with-interface.fixture.ts` — class implements interface with same field name
  - `private-modifier.fixture.ts` — renaming a private field
  - `inherited-field.fixture.ts` — field is in a parent class
- [ ] 12.2 Run and fix
- [ ] 12.3 Commit

## 13. Remaining Refactorings — Fixture Coverage Pass

For each of the following, add 3-5 fixtures covering the most important edge cases documented in `specs/remaining-refactorings/spec.md`. Run tests after each batch; fix if needed.

- [ ] 13.1 **parameterize-function** — multiple-call-sites, default-value, recursive
- [ ] 13.2 **remove-flag-argument** — true/false branches, multiple flags
- [ ] 13.3 **replace-parameter-with-query** — computed-value, multiple-callers
- [ ] 13.4 **replace-query-with-parameter** — side-effects, method-call
- [ ] 13.5 **return-modified-value** — with-callers, chained-modification
- [ ] 13.6 **move-field** — with-initializer, referenced-in-methods
- [ ] 13.7 **pull-up-field / push-down-field** — with-type, with-access-modifier, already-in-parent
- [ ] 13.8 **pull-up-method / push-down-method** — with-typed-params, multiple-subclasses
- [ ] 13.9 **pull-up-constructor-body** — field-initialization, different-args
- [ ] 13.10 **extract-class** — with-typed-fields, field-used-in-remaining-methods
- [ ] 13.11 **extract-superclass** — shared-methods, with-constructor
- [ ] 13.12 **collapse-hierarchy** — with-subclass-only-methods, with-overrides
- [ ] 13.13 **remove-subclass** — with-overridden-methods, multiple-subclasses
- [ ] 13.14 **replace-type-code-with-subclasses** — string-type-code, with-switch
- [ ] 13.15 **replace-subclass-with-delegate** — with-multiple-methods, with-state
- [ ] 13.16 **replace-superclass-with-delegate** — with-multiple-methods
- [ ] 13.17 **encapsulate-record** — typed-fields, with-readonly, with-methods
- [ ] 13.18 **encapsulate-collection** — array-field, with-direct-mutation
- [ ] 13.19 **encapsulate-variable** — with-operations, with-callers
- [ ] 13.20 **hide-delegate** — with-chained-access
- [ ] 13.21 **remove-middle-man** — multiple-delegating-methods
- [ ] 13.22 **remove-setting-method** — with-initializer-in-constructor, with-validation
- [ ] 13.23 **consolidate-conditional-expression** — or-conditions, nested, ternary
- [ ] 13.24 **decompose-conditional** — with-else, complex-condition, early-return
- [ ] 13.25 **replace-nested-conditional-with-guard-clauses** — multiple-guards, with-else
- [ ] 13.26 **replace-control-flag-with-break** — while-loop, for-loop, multiple-exits
- [ ] 13.27 **introduce-assertion** — null-check, range-check, with-message, async
- [ ] 13.28 **introduce-special-case** — null-check, undefined-check, multiple-callers
- [ ] 13.29 **replace-conditional-with-polymorphism** — string-dispatch, multiple-types
- [ ] 13.30 **split-loop** — two-accumulations, dependent-reject
- [ ] 13.31 **split-phase** — with-shared-data, with-typed-intermediate
- [ ] 13.32 **combine-functions-into-class** — with-shared-data, exported-functions
- [ ] 13.33 **combine-functions-into-transform** — multi-transform
- [ ] 13.34 **separate-query-from-modifier** — modifier-then-query, with-conditional-mutation
- [ ] 13.35 **substitute-algorithm** — simpler-implementation, with-edge-cases
- [ ] 13.36 **replace-function-with-command** — with-params-as-fields, with-return-value
- [ ] 13.37 **replace-command-with-function** — with-state, multiple-execute-calls
- [ ] 13.38 **replace-error-code-with-exception** — null-return, negative-return
- [ ] 13.39 **replace-exception-with-precheck** — try-catch-guard, multiple-clauses
- [ ] 13.40 **replace-primitive-with-object** — with-operations, with-string, with-boolean
- [ ] 13.41 **change-reference-to-value** — with-equality-check
- [ ] 13.42 **change-value-to-reference** — with-shared-mutation
- [ ] 13.43 **replace-magic-literal** — boolean-literal, template-literal-context
- [ ] 13.44 **replace-inline-code-with-function-call** — exact-match, multiple-occurrences
- [ ] 13.45 **replace-derived-variable-with-query** — with-multiple-refs
- [ ] 13.46 **remove-dead-code** — unreachable-after-return, always-false-condition
- [ ] 13.47 **introduce-parameter-object** — all-parameters, with-defaults, with-callers
- [ ] 13.48 **preserve-whole-object** — from-property-access, computed-values
- [ ] 13.49 **move-statements-into-function** — multiple-callers, variable-leakage
- [ ] 13.50 **move-statements-to-callers** — multiple-callers, with-function-params
- [ ] 13.51 **parameterize-function** — with-callers
- [ ] 13.52 **replace-function-with-command** (verify)
- [ ] 13.53 **return-modified-value** (verify)
