import { registry } from "../engine/refactoring-registry.js";
import type { RefactoringDefinition } from "../engine/refactoring.types.js";

// Tier 1 — Variable & Expression
import { extractVariable } from "./extract-variable/index.js";
import { inlineVariable } from "./inline-variable/index.js";
import { renameVariable } from "./rename-variable/index.js";
import { replaceTempWithQuery } from "./replace-temp-with-query/index.js";
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

const allRefactorings: RefactoringDefinition[] = [
  // Tier 1
  extractVariable,
  inlineVariable,
  renameVariable,
  replaceTempWithQuery,
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
];

export function registerAll(): void {
  for (const def of allRefactorings) {
    registry.register(def);
  }
}
