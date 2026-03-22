import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  identifierParam,
  resolveClass,
} from "../../engine/refactoring-builder.js";
import type { ClassContext } from "../../engine/refactoring-builder.js";

function buildRegistryMethod(className: string, keyParam: string): string {
  return (
    `  private static _registry: Map<string, ${className}> = new Map();\n\n` +
    `  static getInstance(${keyParam}: string): ${className} {\n` +
    `    if (!${className}._registry.has(${keyParam})) {\n` +
    `      ${className}._registry.set(${keyParam}, new ${className}(${keyParam}));\n` +
    `    }\n` +
    `    return ${className}._registry.get(${keyParam}) as ${className};\n` +
    `  }`
  );
}

export const changeValueToReference = defineRefactoring<ClassContext>({
  name: "Change Value To Reference",
  kebabName: "change-value-to-reference",
  tier: 3,
  description:
    "Adds a static getInstance() factory method with an internal registry to a class, enabling shared reference semantics.",
  params: [
    fileParam(),
    identifierParam("target", "Name of the class to convert to reference semantics"),
  ],
  resolve: (project, params) =>
    resolveClass(project, params as { file: string; target: string }),
  preconditions(): PreconditionResult {
    return { ok: true, errors: [] };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { cls: targetClass } = ctx;

    const ctor = targetClass.getConstructors()[0];
    const keyParam = ctor?.getParameters()[0]?.getName() ?? "id";

    const registryMethod = buildRegistryMethod(target, keyParam);
    targetClass.addMember(registryMethod);

    return {
      success: true,
      filesChanged: [file],
      description: `Added getInstance() factory with registry to class '${target}' for reference semantics`,
    };
  },
});
