import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

export const replaceCommandWithFunction = defineRefactoring<ClassContext>({
  name: "Replace Command With Function",
  kebabName: "replace-command-with-function",
  tier: 2,
  description: "Converts a command class with an execute method back into a plain function.",
  params: [
    param.file(),
    param.identifier("target", "Name of the command class to convert into a function"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(ctx: ClassContext): PreconditionResult {
    const errors: string[] = [];
    const { cls } = ctx;

    const executeMethod = cls.getMethod("execute");
    if (!executeMethod) {
      errors.push(`Class '${cls.getName()}' does not have an 'execute' method`);
    }

    const constructor = cls.getConstructors()[0];
    if (!constructor) {
      errors.push(`Class '${cls.getName()}' does not have a constructor`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { cls } = ctx;

    const executeMethod = cls.getMethod("execute");
    if (!executeMethod) {
      return {
        success: false,
        filesChanged: [],
        description: `Class '${target}' has no 'execute' method`,
      };
    }

    const constructors = cls.getConstructors();
    if (constructors.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `Class '${target}' has no constructor`,
      };
    }

    const ctor = constructors[0];
    if (!ctor) {
      return {
        success: false,
        filesChanged: [],
        description: `Class '${target}' has no constructor`,
      };
    }
    const ctorParams = ctor.getParameters();

    const returnTypeNode = executeMethod.getReturnTypeNode();
    const returnType = returnTypeNode ? returnTypeNode.getText() : "void";

    const body = executeMethod.getBody();
    const bodyText = body ? body.getText() : "{}";

    // Derive function parameter list from constructor params
    const fnParamList = ctorParams
      .map((cp) => {
        const typeNode = cp.getTypeNode();
        const typeName = typeNode ? typeNode.getText() : "unknown";
        return `${cp.getName()}: ${typeName}`;
      })
      .join(", ");

    // Replace this.field references in execute body with plain parameter names
    let fnBody = bodyText;
    for (const cp of ctorParams) {
      const name = cp.getName();
      fnBody = fnBody.replace(new RegExp(`this\\.${name}\\b`, "g"), name);
    }

    const functionName = target.charAt(0).toLowerCase() + target.slice(1);
    const fnText = `function ${functionName}(${fnParamList}): ${returnType} ${fnBody}`;

    // Remove the class and add the function
    cls.remove();
    sf.addStatements(`\n${fnText}\n`);

    return {
      success: true,
      filesChanged: [file],
      description: `Converted command class '${target}' into function '${functionName}'`,
    };
  },
});
