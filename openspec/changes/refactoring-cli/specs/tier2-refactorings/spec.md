## ADDED Requirements

### Requirement: Extract Function
The system SHALL extract a code fragment into a new function, passing needed variables as parameters and handling return values.
- Params: `file`, `target` (line range), `name` (function name)

#### Scenario: Extract with parameters and return
- **WHEN** selected lines use local variables and produce a result
- **THEN** the new function receives those variables as parameters and returns the result

### Requirement: Inline Function
The system SHALL replace a function call with the function body and remove the function declaration if no other callers exist.
- Params: `file`, `target` (function name)

#### Scenario: Single caller inline
- **WHEN** a function has one call site
- **THEN** the call is replaced with the body and the function is removed

### Requirement: Change Function Declaration
The system SHALL rename a function or change its parameters across all call sites.
- Params: `file`, `target` (function name), `name` (new name, optional), `params` (new parameter list, optional)

#### Scenario: Rename function across codebase
- **WHEN** `apply change-function-declaration --file f.ts --target oldFn --name newFn`
- **THEN** the function and all call sites are updated

### Requirement: Parameterize Function
The system SHALL add a parameter to a function to replace a hardcoded value, updating all call sites.
- Params: `file`, `target` (function name), `value` (the literal to parameterize), `paramName` (new parameter name)

#### Scenario: Parameterize hardcoded value
- **WHEN** a function contains a hardcoded value
- **THEN** the value becomes a parameter and call sites pass the original value

### Requirement: Remove Flag Argument
The system SHALL split a function that uses a boolean flag argument into two separate functions.
- Params: `file`, `target` (function name), `flag` (parameter name)

#### Scenario: Split by flag
- **WHEN** `apply remove-flag-argument --file f.ts --target ship --flag isRush`
- **THEN** two functions `shipRegular` and `shipRush` are created and call sites are updated

### Requirement: Move Statements into Function
The system SHALL move statements from callers into the beginning or end of a called function.
- Params: `file`, `target` (function name), `statements` (line range), `position` (start|end)

#### Scenario: Move common preamble
- **WHEN** all callers of a function repeat the same setup code
- **THEN** that code is moved into the function

### Requirement: Move Statements to Callers
The system SHALL move statements from a function back to all of its callers.
- Params: `file`, `target` (function name), `statements` (line range in the function)

#### Scenario: Move varying logic to callers
- **WHEN** a function contains logic that varies per call site
- **THEN** that logic is moved to each caller

### Requirement: Replace Inline Code with Function Call
The system SHALL replace a code fragment with a call to an existing function that does the same thing.
- Params: `file`, `target` (line range), `function` (existing function name)

#### Scenario: Replace with existing function
- **WHEN** code duplicates what an existing function does
- **THEN** it is replaced with a call to that function

### Requirement: Combine Functions into Transform
The system SHALL combine multiple functions that compute derived values into a single transform function.
- Params: `file`, `targets` (function names), `name` (transform function name)

#### Scenario: Combine derivations
- **WHEN** multiple functions enrich the same record
- **THEN** a single transform function is created that applies all enrichments

### Requirement: Split Phase
The system SHALL split a function into two sequential phases, connected by an intermediate data structure.
- Params: `file`, `target` (function name), `splitPoint` (line number)

#### Scenario: Separate parsing from calculation
- **WHEN** a function mixes parsing and calculation
- **THEN** it is split into a parse phase and a calculate phase with an intermediate record

### Requirement: Split Loop
The system SHALL split a loop that does multiple things into separate loops, one per concern.
- Params: `file`, `target` (line range of loop)

#### Scenario: Split multi-purpose loop
- **WHEN** a loop computes sum and finds max
- **THEN** two loops are created: one for sum, one for max

### Requirement: Replace Loop with Pipeline
The system SHALL replace a loop with a collection pipeline (map, filter, reduce).
- Params: `file`, `target` (line range of loop)

#### Scenario: Loop to pipeline
- **WHEN** a for loop filters and maps an array
- **THEN** it is replaced with `.filter(...).map(...)`

### Requirement: Consolidate Conditional Expression
The system SHALL combine a sequence of conditional checks that return the same result into a single conditional.
- Params: `file`, `target` (line range)

#### Scenario: Merge guards
- **WHEN** three if statements all return 0
- **THEN** they are combined into one if with an OR condition

### Requirement: Decompose Conditional
The system SHALL extract the condition, then-branch, and else-branch of a complex conditional into named functions.
- Params: `file`, `target` (line of if statement)

#### Scenario: Extract condition and branches
- **WHEN** an if-else has complex logic in condition and branches
- **THEN** each part is extracted to a named function

### Requirement: Replace Nested Conditional with Guard Clauses
The system SHALL replace nested conditionals with early-return guard clauses.
- Params: `file`, `target` (function name)

#### Scenario: Flatten nested ifs
- **WHEN** a function has deeply nested if-else
- **THEN** edge cases become guard clauses with early returns

### Requirement: Replace Conditional with Polymorphism
The system SHALL replace a conditional (switch/if-else on type) with polymorphic classes.
- Params: `file`, `target` (function or switch statement)

#### Scenario: Switch to polymorphism
- **WHEN** a switch statement handles different types
- **THEN** each case becomes a subclass with an overridden method

### Requirement: Introduce Special Case
The system SHALL replace checks for a special-case value with a special-case object (Null Object pattern).
- Params: `file`, `target` (class name), `specialCase` (the value being checked for, e.g. "unknown")

#### Scenario: Null object
- **WHEN** code frequently checks `if (customer === "unknown")`
- **THEN** an `UnknownCustomer` class is created that provides default behavior

### Requirement: Separate Query from Modifier
The system SHALL split a function that both returns a value and has side effects into two functions.
- Params: `file`, `target` (function name)

#### Scenario: Split query and command
- **WHEN** a function returns a value AND modifies state
- **THEN** it is split into a pure query and a separate modifier

### Requirement: Replace Parameter with Query
The system SHALL remove a parameter that can be computed by the function itself.
- Params: `file`, `target` (function name), `param` (parameter to remove)

#### Scenario: Remove derivable parameter
- **WHEN** a parameter's value can be derived from other available data
- **THEN** the parameter is removed and computed internally, call sites updated

### Requirement: Replace Query with Parameter
The system SHALL replace a function's internal query with a parameter, pushing the query to callers.
- Params: `file`, `target` (function name), `query` (the internal call to externalize)

#### Scenario: Externalize dependency
- **WHEN** a function internally calls a global or dependency
- **THEN** that value becomes a parameter and callers pass it in

### Requirement: Preserve Whole Object
The system SHALL replace multiple parameters derived from the same object with the whole object.
- Params: `file`, `target` (function name), `object` (the source object)

#### Scenario: Pass whole object
- **WHEN** a function receives `obj.a, obj.b, obj.c` as separate params
- **THEN** it receives `obj` and accesses properties internally

### Requirement: Introduce Parameter Object
The system SHALL replace a group of parameters that travel together with a new class/interface.
- Params: `file`, `target` (function name), `params` (parameter names to group), `name` (new type name)

#### Scenario: Group parameters
- **WHEN** a function has `startDate, endDate` parameters used together
- **THEN** a `DateRange` type is created and the function takes that instead

### Requirement: Remove Setting Method
The system SHALL remove a setter method, making the field set only in the constructor.
- Params: `file`, `target` (setter method name)

#### Scenario: Remove setter
- **WHEN** a setter is only used during initialization
- **THEN** the setter is removed and the value is set in the constructor

### Requirement: Replace Function with Command
The system SHALL replace a function with a command object (a class with an execute method).
- Params: `file`, `target` (function name), `name` (command class name)

#### Scenario: Function to command
- **WHEN** a function has complex logic that would benefit from internal state
- **THEN** a command class is created with the function body in `execute()`

### Requirement: Replace Command with Function
The system SHALL replace a command object with a plain function when the command adds no value.
- Params: `file`, `target` (class name)

#### Scenario: Command to function
- **WHEN** a command class has only an `execute()` method with no state
- **THEN** it is replaced with a plain function

### Requirement: Replace Error Code with Exception
The system SHALL replace error code returns with thrown exceptions.
- Params: `file`, `target` (function name), `errorCode` (the value that indicates error)

#### Scenario: Error code to exception
- **WHEN** a function returns `-1` on error
- **THEN** it throws an exception instead, and callers use try-catch

### Requirement: Replace Exception with Precheck
The system SHALL replace a try-catch with a conditional check before the call.
- Params: `file`, `target` (function name or try-catch location)

#### Scenario: Exception to precheck
- **WHEN** callers catch a predictable exception
- **THEN** they check the condition before calling instead

### Requirement: Replace Derived Variable with Query
The system SHALL replace a variable that is computed from other data with a function call.
- Params: `file`, `target` (variable name), `name` (query function name)

#### Scenario: Variable to query
- **WHEN** a variable is always recomputed from source data
- **THEN** it becomes a function/getter that computes on demand

### Requirement: Substitute Algorithm
The system SHALL replace the body of a function with a different algorithm that produces the same results.
- Params: `file`, `target` (function name), `algorithm` (the replacement body)

#### Scenario: Replace algorithm
- **WHEN** a clearer or more efficient algorithm exists
- **THEN** the function body is replaced while preserving behavior
