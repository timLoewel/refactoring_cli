## Purpose

Specifies fixture coverage gaps and implementation concerns for the 50+ remaining refactorings not covered by dedicated specs. Refactorings are grouped by shared concern. Each group lists missing fixtures and known implementation gaps.

## Requirements

### Requirement: Group A — Function Renaming and Declaration

#### Scenario: change-function-declaration arrow-function
- **GIVEN** the target is an arrow function stored in a `const` variable
- **WHEN** change-function-declaration is applied
- **THEN** the refactoring either renames the const variable and all call sites, or rejects with a clear error (current impl only finds FunctionDeclaration)

#### Scenario: change-function-declaration function-expression
- **GIVEN** the target is a function expression stored in a `const` variable
- **WHEN** change-function-declaration is applied
- **THEN** the behavior is the same as for arrow functions

#### Scenario: change-function-declaration multiple-call-sites
- **GIVEN** the target function is called at multiple sites in different expression positions (not just standalone statements)
- **WHEN** change-function-declaration is applied
- **THEN** all call sites are renamed

#### Scenario: change-function-declaration method-shorthand
- **GIVEN** the target is a method shorthand in an object literal (`{ methodName() {} }`)
- **WHEN** change-function-declaration is applied
- **THEN** the method name and all call sites are updated

#### Scenario: change-function-declaration exported
- **GIVEN** the target is an exported function
- **WHEN** change-function-declaration is applied
- **THEN** the export declaration and all import sites are updated

#### Scenario: change-function-declaration cross-scope-shadowed
- **GIVEN** two functions with the same name exist in different scopes
- **WHEN** change-function-declaration is applied targeting one scope
- **THEN** only that scope's function and its references are renamed

### Requirement: Group B — Parameter Operations

#### Scenario: parameterize-function multiple-call-sites
- **GIVEN** the function has N callers
- **WHEN** parameterize-function is applied
- **THEN** all callers are updated to pass the new parameter

#### Scenario: parameterize-function default-value
- **GIVEN** the new parameter has a default value
- **WHEN** parameterize-function is applied
- **THEN** existing callers may omit the argument (using the default), or all callers are updated

#### Scenario: parameterize-function overloaded
- **GIVEN** the function has TypeScript overload signatures
- **WHEN** parameterize-function is applied
- **THEN** all overload signatures and the implementation are updated

#### Scenario: parameterize-function recursive
- **GIVEN** the function calls itself recursively
- **WHEN** parameterize-function is applied
- **THEN** the recursive call site is also updated

#### Scenario: parameterize-function no-callers
- **GIVEN** the function is exported but has no local callers
- **WHEN** parameterize-function is applied
- **THEN** only the declaration is updated; no call sites need updating

#### Scenario: remove-flag-argument true-and-false-branches
- **GIVEN** the function is called with `true` and with `false` at different sites
- **WHEN** remove-flag-argument is applied
- **THEN** two separate functions are created (one for each branch) and call sites are updated to the appropriate function

#### Scenario: remove-flag-argument default-flag
- **GIVEN** the flag parameter has a default value
- **WHEN** remove-flag-argument is applied
- **THEN** sites that omit the argument are handled according to the default branch

#### Scenario: remove-flag-argument multiple-flags
- **GIVEN** the function has two boolean flag parameters
- **WHEN** remove-flag-argument is applied
- **THEN** the behavior is defined (either handles one at a time or rejects)

#### Scenario: remove-flag-argument flag-used-in-condition
- **GIVEN** the flag is used in a complex expression (not just a simple `if (flag)`)
- **WHEN** remove-flag-argument is applied
- **THEN** the complex expression is correctly split between the two new functions

#### Scenario: replace-parameter-with-query computed-value
- **GIVEN** the parameter is computed from another parameter (`foo(x, x * 2)`)
- **WHEN** replace-parameter-with-query is applied
- **THEN** the body computes `x * 2` internally and all callers drop the second argument

#### Scenario: replace-parameter-with-query multiple-callers
- **GIVEN** the function has multiple callers that pass the now-computed argument
- **WHEN** replace-parameter-with-query is applied
- **THEN** all callers have the argument removed

#### Scenario: replace-query-with-parameter with-side-effects
- **GIVEN** the query has side effects (calling it multiple times changes behavior)
- **WHEN** replace-query-with-parameter is applied
- **THEN** the refactoring warns or refuses to avoid repeated side effects

#### Scenario: replace-query-with-parameter method-call
- **GIVEN** the query is a method call on `this`
- **WHEN** replace-query-with-parameter is applied
- **THEN** the `this`-bound method call is correctly externalized as a parameter

### Requirement: Group C — Class Field Operations

#### Scenario: rename-field inherited-field
- **GIVEN** the field being renamed is also defined in a superclass or subclass
- **WHEN** rename-field is applied
- **THEN** all access sites across the hierarchy are updated, or the refactoring rejects if it cannot safely determine the full scope

#### Scenario: rename-field private-field
- **GIVEN** the field uses private class field syntax (`#privateField`)
- **WHEN** rename-field is applied
- **THEN** the private field name and all `this.#field` accesses are updated

#### Scenario: rename-field optional-chaining
- **GIVEN** the field is accessed via optional chaining (`obj?.fieldName`)
- **WHEN** rename-field is applied
- **THEN** the optional chaining access is also updated

#### Scenario: rename-field destructured
- **GIVEN** a class instance is destructured to access the field (`const { field } = instance`)
- **WHEN** rename-field is applied
- **THEN** the destructuring pattern is updated

#### Scenario: rename-field interface-field
- **GIVEN** the field is declared in an interface that the class implements
- **WHEN** rename-field is applied
- **THEN** the interface declaration and all implementing class fields are updated

#### Scenario: rename-field multiple-instances
- **GIVEN** the field is accessed on different instances of the same class throughout the codebase
- **WHEN** rename-field is applied
- **THEN** all instance accesses are updated

#### Scenario: rename-field computed-access
- **GIVEN** the field is accessed via string-keyed bracket notation (`obj['fieldName']`)
- **WHEN** rename-field is applied
- **THEN** the refactoring either updates the string key or documents that bracket notation is not renamed

#### Scenario: move-field with-initializer
- **GIVEN** the field has an initializer value
- **WHEN** move-field is applied
- **THEN** the initializer moves with the field

#### Scenario: move-field with-type
- **GIVEN** the field has a type annotation
- **WHEN** move-field is applied
- **THEN** the type annotation moves with the field

#### Scenario: move-field referenced-in-methods
- **GIVEN** the class's own methods access the field being moved
- **WHEN** move-field is applied
- **THEN** those method accesses are updated to go through the new location

#### Scenario: move-field referenced-externally
- **GIVEN** code outside the class accesses the field
- **WHEN** move-field is applied
- **THEN** external accesses are updated to go through the new location

#### Scenario: pull-up-field / push-down-field / pull-up-method / push-down-method — with-type-annotation
- **GIVEN** the field or method has explicit type annotations
- **WHEN** the hierarchy refactoring is applied
- **THEN** type annotations are preserved

#### Scenario: pull-up-field / push-down-field / pull-up-method / push-down-method — with-access-modifier
- **GIVEN** the field or method has `public`, `protected`, or `private` modifier
- **WHEN** the hierarchy refactoring is applied
- **THEN** the access modifier is handled correctly (e.g., cannot pull up a `private` field)

#### Scenario: pull-up-field / push-down-field / pull-up-method / push-down-method — multiple-subclasses
- **GIVEN** the class has multiple subclasses
- **WHEN** pull-up is applied
- **THEN** the field or method is removed from all relevant subclasses

#### Scenario: pull-up-field / push-down-field / pull-up-method / push-down-method — already-in-parent
- **GIVEN** the field or method already exists in the parent class
- **WHEN** pull-up is applied
- **THEN** the refactoring is rejected with a clear precondition error

#### Scenario: encapsulate-record with-typed-fields
- **GIVEN** the record class has fields with explicit type annotations
- **WHEN** encapsulate-record is applied
- **THEN** getter and setter types are inferred from the field types

#### Scenario: encapsulate-record with-private-fields
- **GIVEN** some fields are already private
- **WHEN** encapsulate-record is applied
- **THEN** already-private fields are skipped (not double-encapsulated)

#### Scenario: encapsulate-record with-readonly
- **GIVEN** some fields are `readonly`
- **WHEN** encapsulate-record is applied
- **THEN** `readonly` fields get only getters, not setters

#### Scenario: encapsulate-collection array-field
- **GIVEN** the field is an array
- **WHEN** encapsulate-collection is applied
- **THEN** add, remove, and get methods are generated

#### Scenario: extract-class with-typed-fields
- **GIVEN** fields being extracted have type annotations
- **WHEN** extract-class is applied
- **THEN** type annotations are preserved in the new class

#### Scenario: extract-class field-used-in-remaining-methods
- **GIVEN** the remaining class's methods access the extracted fields
- **WHEN** extract-class is applied
- **THEN** those accesses are updated to go through the delegate object

### Requirement: Group D — Hierarchy Refactorings

#### Scenario: extract-superclass shared-methods
- **GIVEN** multiple classes share common methods
- **WHEN** extract-superclass is applied
- **THEN** the shared methods are lifted into the new superclass

#### Scenario: extract-superclass with-constructor
- **GIVEN** the class has a constructor
- **WHEN** extract-superclass is applied
- **THEN** constructor handling is correct (super call or delegation)

#### Scenario: collapse-hierarchy with-subclass-only-methods
- **GIVEN** the subclass has methods not present in the parent
- **WHEN** collapse-hierarchy is applied
- **THEN** those methods move into the parent

#### Scenario: remove-subclass with-overridden-methods
- **GIVEN** the subclass overrides parent methods
- **WHEN** remove-subclass is applied
- **THEN** the overridden behaviors are inlined into the parent using type-code-based conditionals

#### Scenario: replace-type-code-with-subclasses string-type-code
- **GIVEN** the type code is a string enum
- **WHEN** replace-type-code-with-subclasses is applied
- **THEN** subclasses are created for each string enum value

#### Scenario: replace-subclass-with-delegate / replace-superclass-with-delegate with-multiple-methods
- **GIVEN** N methods are being delegated
- **WHEN** the delegation refactoring is applied
- **THEN** all N forwarding methods are generated

### Requirement: Group E — Conditional Refactorings

#### Scenario: consolidate-conditional-expression or-conditions
- **GIVEN** consecutive if statements with the same body: `if (a) return x; if (b) return x;`
- **WHEN** consolidate-conditional-expression is applied
- **THEN** they are merged into `if (a || b) return x;`

#### Scenario: consolidate-conditional-expression nested-conditions
- **GIVEN** nested if statements with the same body
- **WHEN** consolidate-conditional-expression is applied
- **THEN** they are merged using `&&`

#### Scenario: decompose-conditional with-else-branch
- **GIVEN** an if-else statement with a complex condition and bodies
- **WHEN** decompose-conditional is applied
- **THEN** condition, then-body, and else-body are each extracted to named functions

#### Scenario: replace-nested-conditional-with-guard-clauses multiple-guards
- **GIVEN** multiple conditions to flip into guard clauses
- **WHEN** replace-nested-conditional-with-guard-clauses is applied
- **THEN** all conditions are flipped and the main path is un-nested

#### Scenario: replace-nested-conditional-with-guard-clauses already-flat
- **GIVEN** the code is already flat (no nesting to remove)
- **WHEN** replace-nested-conditional-with-guard-clauses is applied
- **THEN** the refactoring is rejected with a clear precondition error

#### Scenario: replace-control-flag-with-break in-while-loop
- **GIVEN** the control flag pattern is in a while loop
- **WHEN** replace-control-flag-with-break is applied
- **THEN** the flag is replaced with `break`

#### Scenario: replace-control-flag-with-break with-multiple-exits
- **GIVEN** the flag is set at multiple points in the loop
- **WHEN** replace-control-flag-with-break is applied
- **THEN** each flag assignment becomes a `break` statement

### Requirement: Group F — Loop / Pipeline

#### Scenario: split-loop two-accumulations
- **GIVEN** a single loop computes two independent accumulated values
- **WHEN** split-loop is applied
- **THEN** two separate loops are generated, each computing one value

#### Scenario: split-loop dependent-accumulations
- **GIVEN** the accumulations depend on each other
- **WHEN** split-loop is applied
- **THEN** the refactoring is rejected or warns that the split would change semantics

### Requirement: Group G — Code Organization

#### Scenario: slide-statements inside-function
- **GIVEN** the target statement is inside a function body (not a top-level statement)
- **WHEN** slide-statements is applied
- **THEN** the statement is found and moved (implementation must not be limited to `sf.getStatements()`)

#### Scenario: slide-statements dependency-violation
- **GIVEN** sliding a statement past a statement it depends on
- **WHEN** slide-statements is applied
- **THEN** the refactoring warns that the result may be invalid, or rejects

#### Scenario: split-phase with-shared-data
- **GIVEN** both phases need access to the same data
- **WHEN** split-phase is applied
- **THEN** an intermediate data object is created and passed between phases

#### Scenario: combine-functions-into-class with-shared-data
- **GIVEN** functions share common data
- **WHEN** combine-functions-into-class is applied
- **THEN** the shared data becomes class fields

#### Scenario: separate-query-from-modifier modifier-then-query
- **GIVEN** a function modifies state AND returns a value
- **WHEN** separate-query-from-modifier is applied
- **THEN** a void modifier function and a separate query function are created

### Requirement: Group H — Error Handling

#### Scenario: replace-error-code-with-exception null-return
- **GIVEN** a function returns `null` on error
- **WHEN** replace-error-code-with-exception is applied
- **THEN** the function throws instead of returning null, and callers that check for null are updated

#### Scenario: replace-exception-with-precheck try-catch-guard
- **GIVEN** a call site uses try-catch to handle an exception
- **WHEN** replace-exception-with-precheck is applied
- **THEN** the try-catch is replaced with a precondition check before the call

### Requirement: Group I — Value and Object Transformations

#### Scenario: replace-primitive-with-object with-multiple-uses
- **GIVEN** the primitive is used in many places
- **WHEN** replace-primitive-with-object is applied
- **THEN** all use sites are updated to use the new object

#### Scenario: change-reference-to-value with-equality-check
- **GIVEN** the value uses reference equality comparison
- **WHEN** change-reference-to-value is applied
- **THEN** equality checks are updated to use value equality

### Requirement: Group J — Remove and Replace Operations

#### Scenario: remove-dead-code unreachable-after-return
- **GIVEN** code appears after a `return` statement
- **WHEN** remove-dead-code is applied
- **THEN** the unreachable code is removed

#### Scenario: remove-dead-code always-false-condition
- **GIVEN** an `if (false)` branch exists
- **WHEN** remove-dead-code is applied
- **THEN** the always-false branch is removed

#### Scenario: remove-middle-man multiple-delegating-methods
- **GIVEN** a class has N methods that all forward to a delegate
- **WHEN** remove-middle-man is applied
- **THEN** all delegating methods are inlined at call sites

#### Scenario: remove-setting-method with-initializer-in-constructor
- **GIVEN** the field is set only in the constructor
- **WHEN** remove-setting-method is applied
- **THEN** the setter method is removed and the field is made readonly or final

### Requirement: Group K — Command/Query Separation

#### Scenario: replace-function-with-command with-parameters-becoming-fields
- **GIVEN** the function has parameters
- **WHEN** replace-function-with-command is applied
- **THEN** the parameters become Command class fields, initialized in the constructor

#### Scenario: replace-command-with-function with-state
- **GIVEN** the Command builds up state before calling `execute()`
- **WHEN** replace-command-with-function is applied
- **THEN** the state is converted to local variables in the resulting function

### Requirement: Group L — Move Operations

#### Scenario: move-statements-into-function multiple-callers
- **GIVEN** statements are moved into a function that is called from N places
- **WHEN** move-statements-into-function is applied
- **THEN** the statements are in the function and are no longer duplicated at each call site

#### Scenario: replace-inline-code-with-function-call exact-match
- **GIVEN** inline code matches a function body exactly
- **WHEN** replace-inline-code-with-function-call is applied
- **THEN** the inline code is replaced with a call to the function

### Requirement: Group M — Split and Separate

#### Scenario: split-variable two-purposes
- **GIVEN** a variable is used for two completely different values (assigned twice)
- **WHEN** split-variable is applied
- **THEN** two separate variables are created, one for each purpose

#### Scenario: split-variable const-variable
- **GIVEN** the target variable is declared with `const` (cannot be reassigned)
- **WHEN** split-variable is applied
- **THEN** the refactoring is rejected with a clear precondition error

#### Scenario: split-variable references-between-segments
- **GIVEN** a variable is assigned multiple times and has references in each segment
- **WHEN** split-variable is applied
- **THEN** references between the first and second assignment map to the first new variable, references after the second assignment map to the second new variable (not all references mapped to the first variable)

### Requirement: Group N — Introduce and Preserve

#### Scenario: introduce-parameter-object all-parameters
- **GIVEN** all function parameters are grouped
- **WHEN** introduce-parameter-object is applied
- **THEN** a single options object replaces all parameters and all callers are updated

#### Scenario: introduce-parameter-object with-rest-param
- **GIVEN** the function has a rest parameter
- **WHEN** introduce-parameter-object is applied
- **THEN** the rest parameter is not grouped into the object

#### Scenario: preserve-whole-object from-property-access
- **GIVEN** a function is called with `foo(obj.a, obj.b)` where both arguments come from the same object
- **WHEN** preserve-whole-object is applied
- **THEN** the call becomes `foo(obj)` and the function body accesses `obj.a` and `obj.b`

#### Scenario: introduce-assertion null-check
- **GIVEN** a null check assertion is needed
- **WHEN** introduce-assertion is applied
- **THEN** an `if (x === null) throw` guard is inserted at the specified location

### Requirement: Shared Implementation Patterns — Functions-Only Search

Refactorings that search for function declarations (including `change-function-declaration`, `decompose-conditional`, `combine-functions-into-class`) SHALL either support arrow functions and function expressions in variables, or clearly reject them with a documented precondition error.

### Requirement: Shared Implementation Patterns — Top-Level Only Limitation

Refactorings that use `sf.getStatements()` to locate target statements by line number (including `slide-statements`) SHALL be updated to search all descendant statements, not just top-level file statements.

### Requirement: Shared Implementation Patterns — Type Inference

Refactorings that generate function signatures SHALL infer parameter and return types from the TypeScript type checker rather than hardcoding types such as `number`.

### Requirement: Shared Implementation Patterns — Name Collision Check

Refactorings that introduce new names SHALL check for conflicts with existing declarations in the target scope and reject or warn when a collision is detected.
