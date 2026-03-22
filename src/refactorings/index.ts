import { registry } from "../engine/refactoring-registry.js";
import type { RefactoringDefinition } from "../engine/refactoring.types.js";

// Tier 1 — Variable & Expression
import "./extract-variable/index.js"; // self-registers via defineRefactoring
import "./inline-variable/index.js"; // self-registers via defineRefactoring
import "./rename-variable/index.js"; // self-registers via defineRefactoring
import "./replace-temp-with-query/index.js"; // self-registers via defineRefactoring
import { splitVariable } from "./split-variable/index.js";
import { replaceMagicLiteral } from "./replace-magic-literal/index.js";
import { slideStatements } from "./slide-statements/index.js";
import { removeDeadCode } from "./remove-dead-code/index.js";
import { introduceAssertion } from "./introduce-assertion/index.js";
import { returnModifiedValue } from "./return-modified-value/index.js";
import { replaceControlFlagWithBreak } from "./replace-control-flag-with-break/index.js";

// Tier 2 — Function level
import { extractFunction } from "./extract-function/index.js";
import { inlineFunction } from "./inline-function/index.js";
import { changeFunctionDeclaration } from "./change-function-declaration/index.js";
import { parameterizeFunction } from "./parameterize-function/index.js";
import { removeFlagArgument } from "./remove-flag-argument/index.js";
import { moveStatementsIntoFunction } from "./move-statements-into-function/index.js";
import { moveStatementsToCallers } from "./move-statements-to-callers/index.js";
import { replaceInlineCodeWithFunctionCall } from "./replace-inline-code-with-function-call/index.js";
import { combineFunctionsIntoTransform } from "./combine-functions-into-transform/index.js";
import { splitPhase } from "./split-phase/index.js";
import { splitLoop } from "./split-loop/index.js";
import { replaceLoopWithPipeline } from "./replace-loop-with-pipeline/index.js";
import { consolidateConditionalExpression } from "./consolidate-conditional-expression/index.js";
import { decomposeConditional } from "./decompose-conditional/index.js";
import { replaceNestedConditionalWithGuardClauses } from "./replace-nested-conditional-with-guard-clauses/index.js";
import { replaceConditionalWithPolymorphism } from "./replace-conditional-with-polymorphism/index.js";
import { introduceSpecialCase } from "./introduce-special-case/index.js";
import { separateQueryFromModifier } from "./separate-query-from-modifier/index.js";
import { replaceParameterWithQuery } from "./replace-parameter-with-query/index.js";
import { replaceQueryWithParameter } from "./replace-query-with-parameter/index.js";
import { preserveWholeObject } from "./preserve-whole-object/index.js";
import { introduceParameterObject } from "./introduce-parameter-object/index.js";
import { removeSettingMethod } from "./remove-setting-method/index.js";
import { replaceFunctionWithCommand } from "./replace-function-with-command/index.js";
import { replaceCommandWithFunction } from "./replace-command-with-function/index.js";
import { replaceErrorCodeWithException } from "./replace-error-code-with-exception/index.js";
import { replaceExceptionWithPrecheck } from "./replace-exception-with-precheck/index.js";
import { replaceDerivedVariableWithQuery } from "./replace-derived-variable-with-query/index.js";
import { substituteAlgorithm } from "./substitute-algorithm/index.js";

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
  // Tier 1
  splitVariable,
  replaceMagicLiteral,
  slideStatements,
  removeDeadCode,
  introduceAssertion,
  returnModifiedValue,
  replaceControlFlagWithBreak,
  // Tier 2
  extractFunction,
  inlineFunction,
  changeFunctionDeclaration,
  parameterizeFunction,
  removeFlagArgument,
  moveStatementsIntoFunction,
  moveStatementsToCallers,
  replaceInlineCodeWithFunctionCall,
  combineFunctionsIntoTransform,
  splitPhase,
  splitLoop,
  replaceLoopWithPipeline,
  consolidateConditionalExpression,
  decomposeConditional,
  replaceNestedConditionalWithGuardClauses,
  replaceConditionalWithPolymorphism,
  introduceSpecialCase,
  separateQueryFromModifier,
  replaceParameterWithQuery,
  replaceQueryWithParameter,
  preserveWholeObject,
  introduceParameterObject,
  removeSettingMethod,
  replaceFunctionWithCommand,
  replaceCommandWithFunction,
  replaceErrorCodeWithException,
  replaceExceptionWithPrecheck,
  replaceDerivedVariableWithQuery,
  substituteAlgorithm,
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
