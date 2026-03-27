## ADDED Requirements

### Requirement: Extract Class
The system SHALL extract a subset of fields and methods from a class into a new class, with a delegation relationship.
- Params: `file`, `target` (class name), `members` (field/method names to extract), `name` (new class name)

#### Scenario: Extract fields and methods
- **WHEN** a class has fields and methods that form a cohesive group
- **THEN** they are moved to a new class and the original delegates to it

### Requirement: Inline Class
The system SHALL merge a class into another class that uses it, moving all features and updating references.
- Params: `file`, `target` (class to inline), `into` (target class)

#### Scenario: Inline small class
- **WHEN** a class does too little to justify its existence
- **THEN** its members are moved into the using class and the empty class is removed

### Requirement: Move Function
The system SHALL move a function to a different module/class, updating all references and imports across the codebase.
- Params: `file`, `target` (function name), `destination` (target file or class)

#### Scenario: Move to different module
- **WHEN** `apply move-function --file a.ts --target helper --destination b.ts`
- **THEN** the function is moved, imports are updated in all referencing files

### Requirement: Move Field
The system SHALL move a field from one class to another, updating all references.
- Params: `file`, `target` (field name), `from` (source class), `destination` (target class)

#### Scenario: Move field between classes
- **WHEN** a field is used more by another class
- **THEN** it is moved there and accessors are updated

### Requirement: Encapsulate Record
The system SHALL replace direct access to a data record with accessor functions.
- Params: `file`, `target` (record/object name or type)

#### Scenario: Encapsulate plain object
- **WHEN** code directly accesses fields of a data object
- **THEN** getter/setter functions are created and direct access is replaced

### Requirement: Encapsulate Variable
The system SHALL wrap access to a variable behind getter and setter functions.
- Params: `file`, `target` (variable name)

#### Scenario: Encapsulate module variable
- **WHEN** a module-level variable is accessed directly from other modules
- **THEN** getter/setter functions are exported instead

### Requirement: Encapsulate Collection
The system SHALL ensure a collection field is not directly exposed, providing add/remove/get methods instead.
- Params: `file`, `target` (class name), `field` (collection field name)

#### Scenario: Encapsulate array field
- **WHEN** a class exposes an array directly
- **THEN** `add`, `remove`, and `get` methods are created and the getter returns a copy

### Requirement: Replace Primitive with Object
The system SHALL replace a primitive value with a value object class.
- Params: `file`, `target` (variable or field name), `name` (new class name)

#### Scenario: Primitive to value object
- **WHEN** a phone number is stored as a string
- **THEN** a `PhoneNumber` class is created with validation and formatting

### Requirement: Change Reference to Value
The system SHALL make an object a value type (immutable, compared by value).
- Params: `file`, `target` (class name)

#### Scenario: Reference to value
- **WHEN** a mutable reference object should be treated as a value
- **THEN** the class is made immutable with value-based equality

### Requirement: Change Value to Reference
The system SHALL ensure all access to an entity goes through a single shared instance.
- Params: `file`, `target` (class name), `registry` (registry/repository name)

#### Scenario: Value to reference
- **WHEN** multiple copies of the same entity exist
- **THEN** a registry is introduced and all access goes through it

### Requirement: Hide Delegate
The system SHALL create delegating methods on a server class to hide its delegate from clients.
- Params: `file`, `target` (server class), `delegate` (delegate field name), `methods` (methods to expose)

#### Scenario: Hide delegate
- **WHEN** clients call `server.delegate.method()`
- **THEN** `server.method()` is created that delegates, and clients call that instead

### Requirement: Remove Middle Man
The system SHALL remove delegating methods and let clients call the delegate directly. Inverse of Hide Delegate.
- Params: `file`, `target` (server class), `delegate` (delegate field name)

#### Scenario: Remove middle man
- **WHEN** a class has too many simple delegating methods
- **THEN** clients access the delegate directly

### Requirement: Combine Functions into Class
The system SHALL group functions that operate on the same data into a class.
- Params: `file`, `targets` (function names), `name` (new class name), `data` (shared data parameter)

#### Scenario: Functions to class
- **WHEN** multiple functions take the same record as first parameter
- **THEN** a class is created with the record as field and functions as methods

### Requirement: Rename Field
The system SHALL rename a field/property and all its references across the codebase.
- Params: `file`, `target` (current field name), `name` (new field name), `class` (owning class, optional)

#### Scenario: Codebase-wide field rename
- **WHEN** `apply rename-field --file f.ts --target oldField --name newField`
- **THEN** the field and all references across all files are renamed
