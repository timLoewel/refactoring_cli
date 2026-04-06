import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

export const combineFunctionsIntoTransform = defineRefactoring<SourceFileContext>({
  name: "Combine Functions Into Transform",
  kebabName: "combine-functions-into-transform",
  tier: 2,
  description:
    "Creates a new transform function that calls a set of existing functions in sequence.",
  params: [
    param.file(),
    param.string("functions", "Comma-separated list of function names to combine"),
    param.identifier("name", "Name of the new transform function"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const functions = params["functions"] as string;
    const name = params["name"] as string;

    const names = functions
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length < 2) {
      errors.push("At least two function names must be provided");
    }

    for (const fnName of names) {
      const fn = sf
        .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
        .find((f) => f.getName() === fnName);
      if (!fn) {
        errors.push(`Function '${fnName}' not found in file`);
      }
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
    const functions = params["functions"] as string;
    const name = params["name"] as string;

    const names = functions
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const fns = names
      .map((fnName) =>
        sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).find((f) => f.getName() === fnName),
      )
      .filter((f): f is NonNullable<typeof f> => f !== undefined);

    if (fns.length !== names.length) {
      return {
        success: false,
        filesChanged: [],
        description: "One or more specified functions were not found",
      };
    }

    // Collect all parameters (de-duplicated by name)
    const seenParams = new Set<string>();
    const allParams: string[] = [];
    for (const fn of fns) {
      for (const param of fn.getParameters()) {
        if (!seenParams.has(param.getName())) {
          seenParams.add(param.getName());
          allParams.push(param.getText());
        }
      }
    }

    // Build the transform body: call each function in sequence
    const callLines = names.map((fnName) => {
      const fn = fns.find((f) => f.getName() === fnName);
      if (!fn) return "";
      const argNames = fn
        .getParameters()
        .map((par) => par.getName())
        .join(", ");
      return `  ${fnName}(${argNames});`;
    });

    const transformText = `\nfunction ${name}(${allParams.join(", ")}): void {\n${callLines.join("\n")}\n}\n`;
    sf.addStatements(transformText);

    return {
      success: true,
      filesChanged: [file],
      description: `Created transform function '${name}' that combines: ${names.join(", ")}`,
    };
  },
  enumerate: enumerate.variablesAndFunctions,
});
