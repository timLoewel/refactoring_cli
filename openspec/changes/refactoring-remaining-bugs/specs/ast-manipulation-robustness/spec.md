## ADDED Requirements

### Requirement: Preconditions for crash-prone AST patterns
Refactorings that perform AST node replacement SHALL check preconditions for patterns known to cause syntax errors: decorator expressions, computed property names, complex property access chains, and destructuring assignments.

#### Scenario: Inline-variable rejects decorator target
- **WHEN** inline-variable targets a variable used in a decorator expression
- **THEN** the refactoring refuses with a precondition error rather than producing a syntax error

#### Scenario: Replace-inline-code rejects complex target
- **WHEN** replace-inline-code-with-function-call targets a property declaration or class member
- **THEN** the refactoring refuses with a precondition error

### Requirement: Safer AST mutation ordering
When a refactoring performs multiple AST mutations, it SHALL order them to avoid stale node references: removals from bottom-to-top, replacements before dependent removals, and text captures before any mutations.

#### Scenario: Multi-node replacement doesn't crash
- **WHEN** a refactoring replaces one node and removes adjacent siblings
- **THEN** no "node was removed or forgotten" errors occur

#### Scenario: Text captured before mutation
- **WHEN** a refactoring needs text from a node that will be removed
- **THEN** the text is captured into a variable before any AST mutations begin
