import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

export const removeSettingMethod = defineRefactoring<ClassContext>({
  name: "Remove Setting Method",
  kebabName: "remove-setting-method",
  tier: 2,
  description:
    "Removes a setter method from a class and marks the field as readonly, enforcing initialization only via constructor.",
  params: [
    param.file(),
    param.identifier("target", "Name of the class containing the setter"),
    param.identifier("field", "Name of the field whose setter should be removed"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(ctx: ClassContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const field = params["field"] as string;

    const setter = ctx.cls.getSetAccessor(field);
    if (!setter) {
      errors.push(`No setter for field '${field}' found in class '${ctx.cls.getName()}'`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;
    const { cls } = ctx;

    const setter = cls.getSetAccessor(field);
    if (!setter) {
      return {
        success: false,
        filesChanged: [],
        description: `No setter for field '${field}' found in class '${target}'`,
      };
    }

    // Make the corresponding property readonly if it exists
    const property = cls.getProperty(field);
    if (property) {
      property.setIsReadonly(true);
    }

    // Remove the setter
    setter.remove();

    return {
      success: true,
      filesChanged: [file],
      description: `Removed setter for '${field}' in class '${target}' and marked field as readonly`,
    };
  },
  enumerate: enumerate.classes,
});
