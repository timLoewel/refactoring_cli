import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  stringParam,
  identifierParam,
  resolveSourceFile,
} from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

function convertFunctionToMethod(functionText: string, _functionName: string): string {
  return functionText.replace(/^(export\s+)?function\s+/, "").trim();
}

export const combineFunctionsIntoClass = defineRefactoring<SourceFileContext>({
  name: "Combine Functions Into Class",
  kebabName: "combine-functions-into-class",
  tier: 3,
  description: "Groups a set of related top-level functions into a new class as methods.",
  params: [
    fileParam(),
    stringParam("target", "Comma-separated names of the functions to group into a class"),
    identifierParam("className", "Name for the new class"),
  ],
  resolve: (project, params) =>
    resolveSourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const className = params["className"] as string;
    const file = params["file"] as string;

    const existing = sf
      .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
      .find((c) => c.getName() === className);
    if (existing) {
      errors.push(`Class '${className}' already exists in file`);
    }

    const functionNames = target
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    for (const functionName of functionNames) {
      const found = sf
        .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
        .find((f) => f.getName() === functionName);
      if (!found) {
        errors.push(`Function '${functionName}' not found in file: ${file}`);
      }
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = params["className"] as string;

    const functionNames = target
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    const allDeclarations = sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    const functionsToMove = functionNames
      .map((name) => allDeclarations.find((f) => f.getName() === name))
      .filter((f): f is NonNullable<typeof f> => f !== undefined);

    if (functionsToMove.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: "No matching functions found",
      };
    }

    const methodTexts = functionsToMove.map((fn) =>
      convertFunctionToMethod(fn.getText(), fn.getName() ?? ""),
    );

    const sorted = [...functionsToMove].sort((a, b) => b.getStart() - a.getStart());
    for (const fn of sorted) {
      fn.remove();
    }

    const methodsBody = methodTexts.map((m) => `  ${m}`).join("\n\n  ");
    sf.addStatements(`\nclass ${className} {\n  ${methodsBody}\n}\n`);

    return {
      success: true,
      filesChanged: [file],
      description: `Combined functions [${functionNames.join(", ")}] into new class '${className}'`,
    };
  },
});
