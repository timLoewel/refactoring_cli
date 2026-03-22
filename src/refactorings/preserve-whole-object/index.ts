import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { FunctionContext } from "../../engine/refactoring-builder.js";

export const preserveWholeObject = defineRefactoring<FunctionContext>({
  name: "Preserve Whole Object",
  kebabName: "preserve-whole-object",
  tier: 2,
  description:
    "Replaces multiple parameters derived from one object with the whole object passed as a single parameter.",
  params: [param.file(), param.identifier("target", "Name of the function to inspect")],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext): PreconditionResult {
    const errors: string[] = [];
    const paramCount = ctx.fn.getParameters().length;
    if (paramCount < 2) {
      errors.push(
        `Function '${ctx.fn.getName()}' must have at least 2 parameters to apply preserve-whole-object`,
      );
    }
    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { fn, body } = ctx;

    const existingParams = fn.getParameters();
    if (existingParams.length < 2) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' needs at least 2 parameters`,
      };
    }

    // Build a record type from existing parameters and replace them with a single object param
    const paramNames = existingParams.map((ep) => ep.getName());
    const paramTypes = existingParams.map((ep) => {
      const typeNode = ep.getTypeNode();
      return typeNode ? typeNode.getText() : "unknown";
    });

    const typeLiteralParts = paramNames.map((name, i) => `${name}: ${paramTypes[i]}`);
    const objectType = `{ ${typeLiteralParts.join("; ")} }`;

    // Remove existing parameters in reverse order
    const sorted = [...existingParams].sort((a, b) => b.getChildIndex() - a.getChildIndex());
    for (const ep of sorted) {
      ep.remove();
    }

    // Add single object parameter
    fn.addParameter({ name: "obj", type: objectType });

    // Replace usages of individual param names with obj.paramName in function body
    const identifiers = body.getDescendantsOfKind(SyntaxKind.Identifier);
    const sorted2 = [...identifiers].sort((a, b) => b.getStart() - a.getStart());
    for (const id of sorted2) {
      if (paramNames.includes(id.getText())) {
        id.replaceWithText(`obj.${id.getText()}`);
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced ${paramNames.length} parameters of '${target}' with a single object parameter`,
    };
  },
});
