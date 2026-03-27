## ADDED Requirements

### Requirement: Extract Variable
The system SHALL extract a selected expression into a named variable and replace the expression with the variable reference.
- Params: `file`, `target` (expression text or line:col range), `name` (variable name)

#### Scenario: Basic extraction
- **WHEN** `apply extract-variable --file f.ts --target "a + b" --name total`
- **THEN** the expression `a + b` is replaced with `const total = a + b;` and all identical occurrences in scope are replaced with `total`

### Requirement: Inline Variable
The system SHALL replace all references to a variable with its initializer expression, then remove the variable declaration.
- Params: `file`, `target` (variable name)

#### Scenario: Basic inline
- **WHEN** `apply inline-variable --file f.ts --target total`
- **THEN** all references to `total` are replaced with its initializer and the declaration is removed

### Requirement: Rename Variable
The system SHALL rename a variable and all its references across the entire codebase.
- Params: `file`, `target` (current name), `name` (new name), `--kind` (optional, to disambiguate)

#### Scenario: Codebase-wide rename
- **WHEN** `apply rename-variable --file f.ts --target oldName --name newName`
- **THEN** the variable and all references across all in-scope files are renamed

#### Scenario: Cross-file rename (multi-file fixture)
- **WHEN** a variable is exported and imported by other files
- **THEN** the rename updates the declaration, all import references, and all usage sites across files. Tested with a multi-file fixture.

### Requirement: Replace Temp with Query
The system SHALL replace a temporary variable with a call to a new function that computes the value.
- Params: `file`, `target` (variable name), `name` (query function name)

#### Scenario: Basic replacement
- **WHEN** `apply replace-temp-with-query --file f.ts --target basePrice --name getBasePrice`
- **THEN** the variable is replaced with a function call and the function is created

### Requirement: Split Variable
The system SHALL split a variable that is assigned more than once into separate variables, one per assignment.
- Params: `file`, `target` (variable name)

#### Scenario: Multiple assignments
- **WHEN** a variable `temp` is assigned twice for different purposes
- **THEN** `apply split-variable` creates two separate variables each used by their respective consumers

### Requirement: Replace Magic Literal
The system SHALL replace a magic literal value with a named constant.
- Params: `file`, `target` (literal value), `name` (constant name)

#### Scenario: Replace number literal
- **WHEN** `apply replace-magic-literal --file f.ts --target "9.81" --name GRAVITY`
- **THEN** all occurrences of `9.81` in scope are replaced with `GRAVITY` and `const GRAVITY = 9.81;` is added

### Requirement: Slide Statements
The system SHALL move statements closer to where they are used, reordering within a block.
- Params: `file`, `target` (line range to move), `destination` (line number)

#### Scenario: Move statement down
- **WHEN** `apply slide-statements --file f.ts --target 5 --destination 10`
- **THEN** the statement at line 5 is moved to line 10, preserving data dependencies

### Requirement: Remove Dead Code
The system SHALL remove unreachable or unused code.
- Params: `file`, `target` (symbol name or line range)

#### Scenario: Remove unused function
- **WHEN** `apply remove-dead-code --file f.ts --target unusedHelper`
- **THEN** the function `unusedHelper` is removed from the file

### Requirement: Introduce Assertion
The system SHALL add an assertion that documents a condition assumed by the code.
- Params: `file`, `target` (line or symbol), `condition` (assertion expression), `message` (optional)

#### Scenario: Add assertion
- **WHEN** `apply introduce-assertion --file f.ts --target processOrder --condition "order.items.length > 0" --message "Order must have items"`
- **THEN** an assertion is inserted at the beginning of `processOrder`

### Requirement: Return Modified Value
The system SHALL refactor code so that a function returns the modified value instead of modifying a parameter.
- Params: `file`, `target` (function name)

#### Scenario: Return instead of mutate
- **WHEN** a function modifies a parameter in place
- **THEN** `apply return-modified-value` changes it to return the new value, and updates all call sites

### Requirement: Replace Control Flag with Break
The system SHALL replace a control flag variable in a loop with `break`, `continue`, or `return`.
- Params: `file`, `target` (flag variable name)

#### Scenario: Replace flag with break
- **WHEN** a boolean flag controls loop exit
- **THEN** `apply replace-control-flag-with-break` removes the flag and uses `break` instead
