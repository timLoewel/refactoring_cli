// Tier 1 — Variable & Expression
import "./extract-variable/index.js"; // self-registers via defineRefactoring
import "./inline-variable/index.js"; // self-registers via defineRefactoring
import "./rename-variable/index.js"; // self-registers via defineRefactoring
import "./replace-temp-with-query/index.js"; // self-registers via defineRefactoring
import "./split-variable/index.js"; // self-registers via defineRefactoring
import "./replace-magic-literal/index.js"; // self-registers via defineRefactoring
import "./slide-statements/index.js"; // self-registers via defineRefactoring
import "./remove-dead-code/index.js"; // self-registers via defineRefactoring
import "./introduce-assertion/index.js"; // self-registers via defineRefactoring
import "./return-modified-value/index.js"; // self-registers via defineRefactoring
import "./replace-control-flag-with-break/index.js"; // self-registers via defineRefactoring

// Tier 2 — Function level
import "./extract-function/index.js"; // self-registers via defineRefactoring
import "./inline-function/index.js"; // self-registers via defineRefactoring
import "./change-function-declaration/index.js"; // self-registers via defineRefactoring
import "./parameterize-function/index.js"; // self-registers via defineRefactoring
import "./remove-flag-argument/index.js"; // self-registers via defineRefactoring
import "./move-statements-into-function/index.js"; // self-registers via defineRefactoring
import "./move-statements-to-callers/index.js"; // self-registers via defineRefactoring
import "./replace-inline-code-with-function-call/index.js"; // self-registers via defineRefactoring
import "./combine-functions-into-transform/index.js"; // self-registers via defineRefactoring
import "./split-phase/index.js"; // self-registers via defineRefactoring
import "./split-loop/index.js"; // self-registers via defineRefactoring
import "./replace-loop-with-pipeline/index.js"; // self-registers via defineRefactoring
import "./consolidate-conditional-expression/index.js"; // self-registers via defineRefactoring
import "./decompose-conditional/index.js"; // self-registers via defineRefactoring
import "./replace-nested-conditional-with-guard-clauses/index.js"; // self-registers via defineRefactoring
import "./replace-conditional-with-polymorphism/index.js"; // self-registers via defineRefactoring
import "./introduce-special-case/index.js"; // self-registers via defineRefactoring
import "./separate-query-from-modifier/index.js"; // self-registers via defineRefactoring
import "./replace-parameter-with-query/index.js"; // self-registers via defineRefactoring
import "./replace-query-with-parameter/index.js"; // self-registers via defineRefactoring
import "./preserve-whole-object/index.js"; // self-registers via defineRefactoring
import "./introduce-parameter-object/index.js"; // self-registers via defineRefactoring
import "./remove-setting-method/index.js"; // self-registers via defineRefactoring
import "./replace-function-with-command/index.js"; // self-registers via defineRefactoring
import "./replace-command-with-function/index.js"; // self-registers via defineRefactoring
import "./replace-error-code-with-exception/index.js"; // self-registers via defineRefactoring
import "./replace-exception-with-precheck/index.js"; // self-registers via defineRefactoring
import "./replace-derived-variable-with-query/index.js"; // self-registers via defineRefactoring
import "./substitute-algorithm/index.js"; // self-registers via defineRefactoring

// Tier 3 — Class & Object
import "./extract-class/index.js"; // self-registers via defineRefactoring
import "./inline-class/index.js"; // self-registers via defineRefactoring
import "./move-function/index.js"; // self-registers via defineRefactoring
import "./move-field/index.js"; // self-registers via defineRefactoring
import "./encapsulate-record/index.js"; // self-registers via defineRefactoring
import "./encapsulate-variable/index.js"; // self-registers via defineRefactoring
import "./encapsulate-collection/index.js"; // self-registers via defineRefactoring
import "./replace-primitive-with-object/index.js"; // self-registers via defineRefactoring
import "./change-reference-to-value/index.js"; // self-registers via defineRefactoring
import "./change-value-to-reference/index.js"; // self-registers via defineRefactoring
import "./hide-delegate/index.js"; // self-registers via defineRefactoring
import "./remove-middle-man/index.js"; // self-registers via defineRefactoring
import "./combine-functions-into-class/index.js"; // self-registers via defineRefactoring
import "./rename-field/index.js"; // self-registers via defineRefactoring

// Tier 4 — Inheritance
import "./extract-superclass/index.js"; // self-registers via defineRefactoring
import "./collapse-hierarchy/index.js"; // self-registers via defineRefactoring
import "./pull-up-method/index.js"; // self-registers via defineRefactoring
import "./pull-up-field/index.js"; // self-registers via defineRefactoring
import "./pull-up-constructor-body/index.js"; // self-registers via defineRefactoring
import "./push-down-method/index.js"; // self-registers via defineRefactoring
import "./push-down-field/index.js"; // self-registers via defineRefactoring
import "./remove-subclass/index.js"; // self-registers via defineRefactoring
import "./replace-subclass-with-delegate/index.js"; // self-registers via defineRefactoring
import "./replace-superclass-with-delegate/index.js"; // self-registers via defineRefactoring
import "./replace-constructor-with-factory-function/index.js"; // self-registers via defineRefactoring
import "./replace-type-code-with-subclasses/index.js"; // self-registers via defineRefactoring

export function registerAll(): void {
  // All refactorings self-register via defineRefactoring side-effect imports above.
  // This function exists for backward compatibility.
}
