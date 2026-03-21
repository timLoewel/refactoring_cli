import { registry } from "../engine/refactoring-registry.js";
import type { RefactoringDefinition } from "../engine/refactoring.types.js";
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

const allRefactorings: RefactoringDefinition[] = [
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
];

export function registerAll(): void {
  for (const def of allRefactorings) {
    registry.register(def);
  }
}
