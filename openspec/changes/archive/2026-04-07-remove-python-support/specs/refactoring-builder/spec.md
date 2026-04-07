## REMOVED Requirements

### Requirement: Python refactoring builder
**Reason**: Python support removed. `definePythonRefactoring`, `pythonParam`, `PythonProjectContext`, and the entire `src/python/python-refactoring-builder.ts` module are no longer needed.
**Migration**: Delete `src/python/python-refactoring-builder.ts` and all 66 `src/refactorings/*/python.ts` files that import from it. Remove their imports from `src/refactorings/register-all.ts`.

### Requirement: Python codegen modules
**Reason**: Python support removed. Annotation resolver, import generator, and import merger are no longer needed.
**Migration**: Delete `src/python/codegen/` directory and all tests.
