import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

function buildDelegatingMethod(delegate: string, method: string): string {
  return `  ${method}(): unknown { return this.${delegate}.${method}(); }`;
}

export const hideDelegate = defineRefactoring<ClassContext>({
  name: "Hide Delegate",
  kebabName: "hide-delegate",
  tier: 3,
  description:
    "Adds a forwarding method to a class that delegates to a field, hiding the delegate from callers.",
  params: [
    param.file(),
    param.identifier("target", "Name of the class to add the delegating method to"),
    param.identifier("delegate", "Name of the delegate field on the target class"),
    param.identifier("method", "Name of the method on the delegate to expose"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(ctx: ClassContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const delegate = params["delegate"] as string;
    const method = params["method"] as string;
    const { cls } = ctx;

    const delegateProp = cls.getProperty(delegate);
    if (!delegateProp) {
      errors.push(
        `Delegate field '${delegate}' not found on class '${params["target"] as string}'`,
      );
    }

    const existingMethod = cls.getMethod(method);
    if (existingMethod) {
      errors.push(`Method '${method}' already exists on class '${params["target"] as string}'`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegate = params["delegate"] as string;
    const method = params["method"] as string;
    const { cls: targetClass } = ctx;

    const delegatingMethod = buildDelegatingMethod(delegate, method);
    targetClass.addMember(delegatingMethod);

    return {
      success: true,
      filesChanged: [file],
      description: `Added delegating method '${method}()' to class '${target}' hiding delegate field '${delegate}'`,
    };
  },
  enumerate: enumerate.classes,
});
