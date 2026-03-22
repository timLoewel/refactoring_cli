## MODIFIED Requirements

### Requirement: discoverAllFixtureModules function
The test harness SHALL provide a `discoverAllFixtureModules()` function that scans the refactorings directory and returns all modules with fixtures.

#### Scenario: Discover modules with fixtures
- **WHEN** `discoverAllFixtureModules("src/refactorings")` is called
- **THEN** it returns an array of `{ name, refactoringPath, fixtures }` for each refactoring that has a `fixtures/` subdirectory

#### Scenario: Load refactoring for testing
- **WHEN** a fixture module is discovered
- **THEN** the corresponding refactoring's `apply` function can be loaded and invoked against the fixture
