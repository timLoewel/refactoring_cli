import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  identifierParam,
  resolveSourceFile,
} from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

export const changeFunctionDeclaration = defineRefactoring<SourceFileContext>({
  name: "Change Function Declaration",
  kebabName: "change-function-declaration",
  tier: 2,
  description: "Renames a function and updates all call sites within the file.",
  params: [
    fileParam(),
    identifierParam("target", "Current name of the function to rename"),
    identifierParam("name", "New name for the function"),
  ],
  resolve: (project, params) =>
    resolveSourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const name = params["name"] as string;

    const fn = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === target);
    if (!fn) {
      errors.push(`Function '${target}' not found in file`);
    }

    const conflict = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === name);
    if (conflict) {
      errors.push(`A function named '${name}' already exists in the file`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const name = params["name"] as string;

    const fn = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === target);
    if (!fn) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' not found`,
      };
    }

    // Rename all identifiers referencing the old name
    const identifiers = sf
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter((id) => id.getText() === target);
    const sorted = [...identifiers].sort((a, b) => b.getStart() - a.getStart());
    for (const id of sorted) {
      id.replaceWithText(name);
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Renamed function '${target}' to '${name}' and updated ${sorted.length} reference(s)`,
    };
  },
});
