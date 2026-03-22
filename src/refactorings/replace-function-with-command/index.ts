import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { FunctionContext } from "../../engine/refactoring-builder.js";

export const replaceFunctionWithCommand = defineRefactoring<FunctionContext>({
  name: "Replace Function With Command",
  kebabName: "replace-function-with-command",
  tier: 2,
  description:
    "Converts a standalone function into a command class with an execute method, enabling richer state management.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to convert into a command class"),
    param.identifier("className", "Name for the new command class"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const className = params["className"] as string;

    const existing = ctx.sourceFile
      .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
      .find((c) => c.getName() === className);
    if (existing) {
      errors.push(`A class named '${className}' already exists in the file`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = params["className"] as string;
    const { fn, body } = ctx;

    const fnParams = fn.getParameters();
    const returnTypeNode = fn.getReturnTypeNode();
    const returnType = returnTypeNode ? returnTypeNode.getText() : "void";
    const bodyText = body.getText();

    // Build constructor parameters and field declarations
    const fieldDeclarations = fnParams
      .map((ep) => {
        const typeNode = ep.getTypeNode();
        const typeName = typeNode ? typeNode.getText() : "unknown";
        return `  private readonly ${ep.getName()}: ${typeName};`;
      })
      .join("\n");

    const constructorParamList = fnParams
      .map((ep) => {
        const typeNode = ep.getTypeNode();
        const typeName = typeNode ? typeNode.getText() : "unknown";
        return `${ep.getName()}: ${typeName}`;
      })
      .join(", ");

    const constructorAssignments = fnParams
      .map((ep) => `    this.${ep.getName()} = ${ep.getName()};`)
      .join("\n");

    // Replace param references in body with this.param
    let executeBody = bodyText;
    for (const ep of fnParams) {
      const name = ep.getName();
      executeBody = executeBody.replace(new RegExp(`\\b${name}\\b`, "g"), `this.${name}`);
    }

    const classText = [
      `class ${className} {`,
      fieldDeclarations,
      `  constructor(${constructorParamList}) {`,
      constructorAssignments,
      `  }`,
      `  execute(): ${returnType} ${executeBody}`,
      `}`,
    ]
      .filter((line) => line.trim() !== "")
      .join("\n");

    // Remove the original function
    fn.remove();

    // Add the command class at the end of the file
    sf.addStatements(`\n${classText}\n`);

    return {
      success: true,
      filesChanged: [file],
      description: `Converted function '${target}' into command class '${className}'`,
    };
  },
});
