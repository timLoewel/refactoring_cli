import type { MethodDeclaration } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

function isDelegatingMethod(method: MethodDeclaration, delegateName: string): boolean {
  const body = method.getBody();
  if (!body) {
    return false;
  }
  const bodyText = body.getText();
  return bodyText.includes(`this.${delegateName}.`);
}

export const removeMiddleMan = defineRefactoring<ClassContext>({
  name: "Remove Middle Man",
  kebabName: "remove-middle-man",
  tier: 3,
  description:
    "Removes methods that merely forward calls to a delegate field, exposing the delegate directly.",
  params: [
    param.file(),
    param.identifier("target", "Name of the class acting as middle man"),
    param.identifier("delegate", "Name of the delegate field whose methods are being forwarded"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(ctx: ClassContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const delegate = params["delegate"] as string;
    const { cls } = ctx;

    const delegateProp = cls.getProperty(delegate);
    if (!delegateProp) {
      errors.push(
        `Delegate field '${delegate}' not found on class '${params["target"] as string}'`,
      );
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegate = params["delegate"] as string;
    const { cls: targetClass } = ctx;

    const delegatingMethods = targetClass
      .getMethods()
      .filter((method) => isDelegatingMethod(method, delegate));

    const removedNames = delegatingMethods.map((method) => method.getName());

    const reversedMethods = [...delegatingMethods].reverse();
    for (const method of reversedMethods) {
      method.remove();
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Removed ${removedNames.length} delegating method(s) [${removedNames.join(", ")}] from '${target}', exposing delegate '${delegate}' directly`,
    };
  },
});
