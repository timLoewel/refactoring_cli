import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { FunctionContext } from "../../engine/refactoring-builder.js";

export const introduceParameterObject = defineRefactoring<FunctionContext>({
  name: "Introduce Parameter Object",
  kebabName: "introduce-parameter-object",
  tier: 2,
  description:
    "Groups a set of parameters into a single parameter object to reduce argument lists.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to refactor"),
    param.string("params", "Comma-separated parameter names to group into the object"),
    param.identifier("objectName", "Name of the new parameter object"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const paramsStr = params["params"] as string;

    const paramNames = paramsStr
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (paramNames.length < 2) {
      errors.push("At least 2 parameter names must be provided to group into an object");
    }

    const existingParamNames = ctx.fn.getParameters().map((ep) => ep.getName());
    for (const name of paramNames) {
      if (!existingParamNames.includes(name)) {
        errors.push(`Parameter '${name}' not found in function '${ctx.fn.getName()}'`);
      }
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramsStr = params["params"] as string;
    const objectName = params["objectName"] as string;
    const { fn, body } = ctx;

    const paramNames = paramsStr
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const existingParams = fn.getParameters();

    // Build type literal for the object from the grouped parameters
    const groupedParams = existingParams.filter((ep) => paramNames.includes(ep.getName()));
    const typeParts = groupedParams.map((ep) => {
      const typeNode = ep.getTypeNode();
      const typeName = typeNode ? typeNode.getText() : "unknown";
      return `${ep.getName()}: ${typeName}`;
    });
    const objectType = `{ ${typeParts.join("; ")} }`;

    // Record the index of first grouped param to know where to insert the object param
    const firstGroupedIndex = existingParams.findIndex((ep) => paramNames.includes(ep.getName()));

    // Remove grouped parameters in reverse order
    const toRemove = [...existingParams].filter((ep) => paramNames.includes(ep.getName()));
    const sortedRemove = [...toRemove].sort((a, b) => b.getChildIndex() - a.getChildIndex());
    for (const ep of sortedRemove) {
      ep.remove();
    }

    // Insert the new object parameter at the position of the first removed param
    const insertAt = firstGroupedIndex >= 0 ? firstGroupedIndex : 0;
    fn.insertParameter(insertAt, { name: objectName, type: objectType });

    // Replace usages of grouped param names in the body with objectName.paramName
    const identifiers = body.getDescendantsOfKind(SyntaxKind.Identifier);
    const sortedIds = [...identifiers].sort((a, b) => b.getStart() - a.getStart());
    for (const id of sortedIds) {
      if (paramNames.includes(id.getText())) {
        id.replaceWithText(`${objectName}.${id.getText()}`);
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Grouped parameters [${paramNames.join(", ")}] of '${target}' into object '${objectName}'`,
    };
  },
});
