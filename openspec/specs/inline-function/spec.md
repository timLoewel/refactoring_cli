## Purpose

Specifies fixture coverage and implementation requirements for the Inline Function refactoring. The current implementation has a critical safety bug: it removes the function declaration regardless of whether all call sites were successfully inlined, and it only handles ExpressionStatement call sites with no parameter substitution.

## Requirements

### Requirement: Critical Safety Fix — Never Remove Function If Inlining Is Incomplete

The implementation SHALL NOT remove the function declaration unless every call site has been successfully inlined. If any call site cannot be inlined, the refactoring must either refuse entirely or report a mismatch error without modifying the source.

### Requirement: Must-Have Edge Case Fixtures

The implementation SHALL be verified against the following must-have fixtures:

#### Scenario: with-parameters
- **GIVEN** the target function takes parameters
- **WHEN** inline-function is applied
- **THEN** parameter names in the function body are substituted with the actual argument expressions at each call site

#### Scenario: return-value-used
- **GIVEN** the target function returns a value that is captured in a variable declaration
- **WHEN** inline-function is applied
- **THEN** the call site is replaced with the return expression (with parameter substitution applied), and the variable declaration is preserved

#### Scenario: single-expression-arrow
- **GIVEN** the target function is an arrow function stored in a `const` variable with an expression body
- **WHEN** inline-function is applied
- **THEN** the function is found and inlined correctly (implementation must search VariableDeclaration with ArrowFunction, not only FunctionDeclaration)

#### Scenario: multi-statement-body
- **GIVEN** the target function body has multiple statements (not a single return)
- **WHEN** inline-function is applied
- **THEN** the refactoring is rejected with a clear precondition error (multi-statement bodies cannot be trivially inlined into expression positions)

#### Scenario: void-multiple-call-sites
- **GIVEN** the target is a void function called at multiple ExpressionStatement sites
- **WHEN** inline-function is applied
- **THEN** all call sites are replaced with the function body statements (with parameter substitution applied), and the function declaration is removed

#### Scenario: call-in-expression
- **GIVEN** the target function (with a single-expression return body) is called inside a larger expression
- **WHEN** inline-function is applied
- **THEN** the call is replaced with the return expression (with parameter substitution), or the refactoring is rejected with a clear error if inlining is not feasible

### Requirement: Should-Have Edge Case Fixtures

The implementation SHOULD be verified against the following fixtures:

#### Scenario: recursive
- **GIVEN** the target function calls itself recursively
- **WHEN** inline-function is applied
- **THEN** the refactoring is rejected with a clear precondition error

#### Scenario: method-call
- **GIVEN** the target function is used both as a direct call and as a method reference on an object
- **WHEN** inline-function is applied
- **THEN** the refactoring is rejected (safest), or only direct calls are inlined and the function declaration is preserved since method references remain

#### Scenario: with-default-parameters
- **GIVEN** the target function has parameters with default values
- **WHEN** inline-function is applied
- **THEN** call sites that omit the argument have the default value substituted

#### Scenario: async-function
- **GIVEN** the target is an async function with `await` in its body, called with `await` in an async call site
- **WHEN** inline-function is applied
- **THEN** the inlined body's `await` expressions remain valid in the call site context, or the refactoring is rejected if the call site is not async

#### Scenario: function-expression
- **GIVEN** the target function is a function expression (not declaration) stored in a `const`
- **WHEN** inline-function is applied
- **THEN** it is inlined the same as an arrow function

### Requirement: Nice-to-Have Edge Case Fixtures

The implementation MAY be verified against the following fixtures:

#### Scenario: call-in-template-literal
- **GIVEN** the target function (single-expression return) is called inside a template literal interpolation
- **WHEN** inline-function is applied
- **THEN** the interpolation is replaced with the return expression

#### Scenario: call-in-conditional
- **GIVEN** the target function (single-expression return) is called as an `if` condition
- **WHEN** inline-function is applied
- **THEN** the condition is replaced with the return expression

### Requirement: Implementation — Function Form Support

The implementation SHALL find the target function in all of these forms:
- `function name() {}`
- `const name = () => {}`
- `const name = function() {}`

### Requirement: Implementation — Parameter Substitution

The implementation SHALL map parameter names to call-site argument expressions and replace all occurrences of parameter identifiers in the body with the corresponding argument text. Default parameter values SHALL be used when the call site omits that argument.

### Requirement: Implementation — Return Value Handling

The implementation SHALL handle three body forms:
- Single `return <expr>` body → inline as expression
- Multi-statement body with final return → reject with clear error or hoist statements
- Void body → inline statements at call site
