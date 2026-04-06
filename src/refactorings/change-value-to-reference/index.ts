import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

function buildRegistryMethod(
  className: string,
  keyParam: string,
  allParams: { name: string; type: string }[],
): string {
  const paramList = allParams.map((p) => `${p.name}: ${p.type}`).join(", ");
  const argList = allParams.map((p) => p.name).join(", ");
  return (
    `  private static _registry: Map<string, ${className}> = new Map();\n\n` +
    `  static getInstance(${paramList}): ${className} {\n` +
    `    if (!${className}._registry.has(${keyParam})) {\n` +
    `      ${className}._registry.set(${keyParam}, new ${className}(${argList}));\n` +
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
    param.file(),
    param.identifier("target", "Name of the class to convert to reference semantics"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(ctx: ClassContext): PreconditionResult {
    const ctor = ctx.cls.getConstructors()[0];
    const firstParam = ctor?.getParameters()[0];
    if (!firstParam) {
      return {
        ok: false,
        errors: [
          `Precondition failed: class '${ctx.cls.getName() ?? ""}' has no constructor parameter to use as registry key`,
        ],
      };
    }
    return { ok: true, errors: [] };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { cls: targetClass } = ctx;

    const ctor = targetClass.getConstructors()[0];
    const ctorParams = ctor?.getParameters() ?? [];
    const keyParam = ctorParams[0]?.getName() ?? "id";
    const allParams = ctorParams.map((p) => ({
      name: p.getName(),
      type: p.getTypeNode()?.getText() ?? "unknown",
    }));
    if (allParams.length === 0) {
      allParams.push({ name: "id", type: "string" });
    }

    const registryMethod = buildRegistryMethod(target, keyParam, allParams);
    targetClass.addMember(registryMethod);

    return {
      success: true,
      filesChanged: [file],
      description: `Added getInstance() factory with registry to class '${target}' for reference semantics`,
    };
  },
  enumerate: enumerate.classes,
});
