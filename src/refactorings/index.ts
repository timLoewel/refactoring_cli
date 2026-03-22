import { registry } from "../engine/refactoring-registry.js";
import type { RefactoringDefinition } from "../engine/refactoring.types.js";

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
import { extractClass } from "./extract-class/index.js";
import { inlineClass } from "./inline-class/index.js";
import { moveFunction } from "./move-function/index.js";
import { moveField } from "./move-field/index.js";
import { encapsulateRecord } from "./encapsulate-record/index.js";
import { encapsulateVariable } from "./encapsulate-variable/index.js";
import { encapsulateCollection } from "./encapsulate-collection/index.js";
import { replacePrimitiveWithObject } from "./replace-primitive-with-object/index.js";
import { changeReferenceToValue } from "./change-reference-to-value/index.js";
import { changeValueToReference } from "./change-value-to-reference/index.js";
import { hideDelegate } from "./hide-delegate/index.js";
import { removeMiddleMan } from "./remove-middle-man/index.js";
import { combineFunctionsIntoClass } from "./combine-functions-into-class/index.js";
import { renameField } from "./rename-field/index.js";

// Tier 4 — Inheritance
import { extractSuperclass } from "./extract-superclass/index.js";
import { collapseHierarchy } from "./collapse-hierarchy/index.js";
import { pullUpMethod } from "./pull-up-method/index.js";
import { pullUpField } from "./pull-up-field/index.js";
import { pullUpConstructorBody } from "./pull-up-constructor-body/index.js";
import { pushDownMethod } from "./push-down-method/index.js";
import { pushDownField } from "./push-down-field/index.js";
import { removeSubclass } from "./remove-subclass/index.js";
import { replaceSubclassWithDelegate } from "./replace-subclass-with-delegate/index.js";
import { replaceSuperclassWithDelegate } from "./replace-superclass-with-delegate/index.js";
import { replaceConstructorWithFactoryFunction } from "./replace-constructor-with-factory-function/index.js";
import { replaceTypeCodeWithSubclasses } from "./replace-type-code-with-subclasses/index.js";

const allRefactorings: RefactoringDefinition[] = [
  // Tier 3
  extractClass,
  inlineClass,
  moveFunction,
  moveField,
  encapsulateRecord,
  encapsulateVariable,
  encapsulateCollection,
  replacePrimitiveWithObject,
  changeReferenceToValue,
  changeValueToReference,
  hideDelegate,
  removeMiddleMan,
  combineFunctionsIntoClass,
  renameField,
  // Tier 4
  extractSuperclass,
  collapseHierarchy,
  pullUpMethod,
  pullUpField,
  pullUpConstructorBody,
  pushDownMethod,
  pushDownField,
  removeSubclass,
  replaceSubclassWithDelegate,
  replaceSuperclassWithDelegate,
  replaceConstructorWithFactoryFunction,
  replaceTypeCodeWithSubclasses,
];

export function registerAll(): void {
  for (const def of allRefactorings) {
    registry.register(def);
  }
}
