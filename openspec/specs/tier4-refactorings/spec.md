## ADDED Requirements

### Requirement: Extract Superclass
The system SHALL create a new superclass from common features of two or more classes.
- Params: `file`, `targets` (class names), `name` (superclass name), `members` (shared members to pull up)

#### Scenario: Extract common base
- **WHEN** two classes share fields and methods
- **THEN** a superclass is created with the shared members and both classes extend it

### Requirement: Collapse Hierarchy
The system SHALL merge a superclass and subclass when they are too similar to justify the hierarchy.
- Params: `file`, `target` (subclass name)

#### Scenario: Merge subclass into parent
- **WHEN** a subclass adds little over its parent
- **THEN** the subclass members are merged into the parent and the subclass is removed

### Requirement: Pull Up Method
The system SHALL move a method from a subclass to its superclass.
- Params: `file`, `target` (method name), `from` (subclass name)

#### Scenario: Pull up common method
- **WHEN** a method exists in multiple subclasses with identical implementation
- **THEN** it is moved to the superclass and removed from subclasses

### Requirement: Pull Up Field
The system SHALL move a field from a subclass to its superclass.
- Params: `file`, `target` (field name), `from` (subclass name)

#### Scenario: Pull up common field
- **WHEN** a field exists in multiple subclasses
- **THEN** it is moved to the superclass

### Requirement: Pull Up Constructor Body
The system SHALL move common constructor logic from subclasses into the superclass constructor.
- Params: `file`, `target` (subclass name), `statements` (lines to pull up)

#### Scenario: Pull up initialization
- **WHEN** subclass constructors share initialization code
- **THEN** the common code moves to `super()` in the superclass constructor

### Requirement: Push Down Method
The system SHALL move a method from a superclass to the subclass(es) that actually use it.
- Params: `file`, `target` (method name), `to` (subclass names)

#### Scenario: Push down specialized method
- **WHEN** a superclass method is only relevant to one subclass
- **THEN** it is moved to that subclass and removed from the superclass

### Requirement: Push Down Field
The system SHALL move a field from a superclass to the subclass(es) that actually use it.
- Params: `file`, `target` (field name), `to` (subclass names)

#### Scenario: Push down specialized field
- **WHEN** a superclass field is only used by one subclass
- **THEN** it is moved to that subclass

### Requirement: Remove Subclass
The system SHALL replace a subclass with a field in the superclass when the subclass does too little.
- Params: `file`, `target` (subclass name)

#### Scenario: Subclass to type field
- **WHEN** a subclass only overrides a type indicator
- **THEN** the subclass is removed and a type field is added to the parent

### Requirement: Replace Subclass with Delegate
The system SHALL replace inheritance with delegation (composition over inheritance).
- Params: `file`, `target` (subclass name), `delegateName` (new delegate class name)

#### Scenario: Inheritance to delegation
- **WHEN** a subclass relationship creates coupling
- **THEN** the subclass becomes a delegate object held by the former superclass

### Requirement: Replace Superclass with Delegate
The system SHALL replace superclass inheritance with a delegate field when the subclass doesn't fully conform to the superclass interface.
- Params: `file`, `target` (subclass name), `delegateName` (field name for former superclass)

#### Scenario: Superclass to delegate
- **WHEN** a class extends another but doesn't truly IS-A
- **THEN** inheritance is replaced with a delegate field

### Requirement: Replace Constructor with Factory Function
The system SHALL replace direct constructor calls with a factory function.
- Params: `file`, `target` (class name), `name` (factory function name)

#### Scenario: Constructor to factory
- **WHEN** `apply replace-constructor-with-factory-function --file f.ts --target Employee --name createEmployee`
- **THEN** a `createEmployee()` factory function is created and all `new Employee()` calls are replaced

### Requirement: Replace Type Code with Subclasses
The system SHALL replace a type code field with subclasses, one per type value.
- Params: `file`, `target` (class name), `typeField` (the type code field)

#### Scenario: Type code to subclasses
- **WHEN** a class has a `type` field with values like `"engineer"`, `"manager"`
- **THEN** `Engineer` and `Manager` subclasses are created and the type field is removed
