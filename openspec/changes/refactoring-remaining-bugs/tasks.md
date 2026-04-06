## 1. Unused Import/Variable Cleanup Pass

Build a shared post-transformation utility that removes unused imports and variables after a refactoring modifies code. Many refactorings (guard clauses, delegate replacement, subclass removal, split-variable) leave behind unused declarations that cause `strict` mode compile errors.

- [ ] 1.1 Design cleanup API: `cleanupUnusedDeclarations(sourceFile)` that removes unused imports and variable declarations
- [ ] 1.2 Implement using ts-morph diagnostics (TS6133 "declared but never read") to identify candidates
- [ ] 1.3 Add fixture tests for cleanup pass (import removal, variable removal, preserving used symbols)
- [ ] 1.4 Integrate into replace-nested-conditional-with-guard-clauses (19 unused declaration failures)
- [ ] 1.5 Integrate into replace-subclass-with-delegate (40 unused declaration failures)
- [ ] 1.6 Integrate into split-variable (47 unused declaration failures)
- [ ] 1.7 Integrate into replace-command-with-function (4 unused declaration failures)
- [ ] 1.8 Integrate into split-loop (8 unused declaration failures)
- [ ] 1.9 Integrate into remaining refactorings that leave unused declarations
- [ ] 1.10 Run real-codebase tests to verify reduction in unused-declaration failures

## 2. AST Manipulation Robustness

Fix syntax error crashes in refactorings that manipulate complex AST structures. The most affected are inline-variable (12 crashes), replace-inline-code-with-function-call (49 crashes), and replace-temp-with-query (17 crashes).

- [ ] 2.1 Investigate inline-variable crash patterns — likely complex expressions needing parenthesization or property access chains
- [ ] 2.2 Fix inline-variable: add parenthesization for more expression contexts (template literals, optional chains, etc.)
- [ ] 2.3 Investigate replace-inline-code-with-function-call crashes — all 49 are syntax errors during replacement
- [ ] 2.4 Fix replace-inline-code-with-function-call: use safer AST replacement patterns (text manipulation fallback when AST fails)
- [ ] 2.5 Investigate replace-temp-with-query crashes (17 syntax errors) — likely duplicate function declarations or complex initializer expressions
- [ ] 2.6 Add preconditions to detect and reject cases that would produce syntax errors
- [ ] 2.7 Create fixture tests for each crash pattern found
- [ ] 2.8 Run real-codebase tests to verify reduction in syntax-error crashes

## 3. Type Inference Improvements

Replace `unknown` type fallbacks with better inference. Affects replace-temp-with-query (24 failures), decompose-conditional (20 failures), encapsulate-variable (4 failures).

- [ ] 3.1 Audit all uses of `getWidenedType` and `getType().getText()` across refactorings
- [ ] 3.2 Use `getText(node)` consistently for context-relative type printing (already partially done)
- [ ] 3.3 Handle generic type parameters: when extracting functions that use generics, carry type params
- [ ] 3.4 Handle `typeof` expressions: use the underlying type instead of falling back to `unknown`
- [ ] 3.5 Add fixtures for complex type scenarios (generics, conditional types, mapped types)
- [ ] 3.6 Run real-codebase tests to verify reduction in unknown-type failures

## 4. Class Hierarchy Refactoring Fixes

Fix argument count/type mismatches in change-value-to-reference (39 failures), collapse-hierarchy (12 failures), and related class refactorings.

- [ ] 4.1 Investigate change-value-to-reference: generated constructor calls have wrong arg count (19) and type mismatches (18)
- [ ] 4.2 Fix constructor argument generation to match the actual constructor signature
- [ ] 4.3 Investigate collapse-hierarchy: merged class loses type identity, missing variable scope (5), type mismatches (3)
- [ ] 4.4 Fix collapse-hierarchy: preserve type exports and update cross-file references
- [ ] 4.5 Investigate combine-functions-into-class: missing variable scope (4), syntax errors (4)
- [ ] 4.6 Fix combine-functions-into-class: handle module-level functions that reference module state
- [ ] 4.7 Add fixtures for each failure pattern
- [ ] 4.8 Run real-codebase tests to verify reduction

## 5. Python Test Infrastructure

Fix test isolation issues where Python tree-sitter parser tests fail when run as part of the full suite but pass in isolation.

- [ ] 5.1 Investigate tree-sitter parser resource sharing between tests (3 failures in full suite, 0 in isolation)
- [ ] 5.2 Fix parser lifecycle: ensure tree-sitter parser is properly initialized/cleaned up per test suite
- [ ] 5.3 Investigate python-rename test failure (TypeError: Cannot read 'type' of undefined) — passes in isolation
- [ ] 5.4 Fix test isolation: likely a shared state issue between python-rename and other test suites
- [ ] 5.5 Add `--forceExit` or `--detectOpenHandles` configuration to catch resource leaks
- [ ] 5.6 Verify all Python tests pass in both isolation and full-suite runs

## 6. Enumerate Improvements

Fix extract-function enumerate to provide valid line ranges instead of defaulting to 0.

- [ ] 6.1 Update extract-function enumerate to provide startLine/endLine for function bodies
- [ ] 6.2 Update buildApplyParams in test harness to handle refactorings with line-number params more intelligently
- [ ] 6.3 Add enumerate to consolidate-conditional-expression (30 "need 2 consecutive ifs" — candidates aren't pre-filtered)
- [ ] 6.4 Improve enumerate for separate-query-from-modifier (pre-filter functions that have both return and side-effects)
- [ ] 6.5 Run real-codebase tests to verify improved candidate hit rates

## 7. Separate-Query-From-Modifier Scope Fix

The current precondition only rejects when the return expression directly references modifier locals. A more complete fix would restructure the split to share state between query and modifier.

- [ ] 7.1 Instead of rejecting, include shared variable declarations in both query and modifier functions
- [ ] 7.2 Handle async functions: propagate async/await to modifier when body uses await
- [ ] 7.3 Handle return type inference: use function's actual return type, not just the declared type
- [ ] 7.4 Add fixtures for shared-state split, async split, and complex return types
- [ ] 7.5 Run real-codebase tests to verify (currently 29 failures, 17 scope-related)
