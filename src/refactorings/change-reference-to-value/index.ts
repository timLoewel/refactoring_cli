import type { ClassDeclaration } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

function makeFieldsReadonly(targetClass: ClassDeclaration): string[] {
  const fieldNames: string[] = [];
  for (const prop of targetClass.getProperties()) {
    prop.setIsReadonly(true);
    fieldNames.push(prop.getName());
  }
  return fieldNames;
}

function buildEqualsMethod(fieldNames: string[], className: string): string {
  const comparisons = fieldNames.map((name) => `this.${name} === other.${name}`).join(" && ");
  const body =
    fieldNames.length > 0
      ? `return other instanceof ${className} && ${comparisons};`
      : `return other instanceof ${className};`;
  return `  equals(other: unknown): boolean {\n    ${body}\n  }`;
}

export const changeReferenceToValue = defineRefactoring<ClassContext>({
  name: "Change Reference To Value",
  kebabName: "change-reference-to-value",
  tier: 3,
  description:
    "Converts a reference object into a value object by making fields readonly and adding an equals method.",
  params: [
    param.file(),
    param.identifier("target", "Name of the class to convert to a value object"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(): PreconditionResult {
    return { ok: true, errors: [] };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { cls: targetClass } = ctx;

    const fieldNames = makeFieldsReadonly(targetClass);
    const equalsMethod = buildEqualsMethod(fieldNames, target);
    targetClass.addMember(equalsMethod);

    return {
      success: true,
      filesChanged: [file],
      description: `Converted class '${target}' to value object: made ${fieldNames.length} field(s) readonly and added equals()`,
    };
  },
  enumerate: enumerate.classes,
});
