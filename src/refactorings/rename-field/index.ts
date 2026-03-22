import { SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

function renamePropertyReferences(
  sf: SourceFile,
  className: string,
  oldName: string,
  newName: string,
): number {
  let renameCount = 0;
  const accessExpressions = sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  for (const access of accessExpressions) {
    if (access.getName() === oldName) {
      const expressionType = access.getExpression().getType();
      const symbol = expressionType.getSymbol();
      if (symbol?.getName() === className) {
        access.getNameNode().replaceWithText(newName);
        renameCount++;
      }
    }
  }
  return renameCount;
}

export const renameField = defineRefactoring<ClassContext>({
  name: "Rename Field",
  kebabName: "rename-field",
  tier: 3,
  description: "Renames a field on a class and updates all references to it within the same file.",
  params: [
    param.file(),
    param.identifier("target", "Name of the class containing the field"),
    param.identifier("field", "Current name of the field to rename"),
    param.identifier("name", "New name for the field"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(ctx: ClassContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const field = params["field"] as string;
    const name = params["name"] as string;
    const { cls } = ctx;

    const prop = cls.getProperty(field);
    if (!prop) {
      errors.push(`Field '${field}' not found on class '${params["target"] as string}'`);
    }

    if (field === name) {
      errors.push("'field' and 'name' must be different");
    }

    const existing = cls.getProperty(name);
    if (existing) {
      errors.push(`Field '${name}' already exists on class '${params["target"] as string}'`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;
    const name = params["name"] as string;
    const { cls: targetClass } = ctx;

    const prop = targetClass.getProperty(field);
    if (!prop) {
      return {
        success: false,
        filesChanged: [],
        description: `Field '${field}' not found on class '${target}'`,
      };
    }

    prop.rename(name);
    const referenceCount = renamePropertyReferences(sf, target, field, name);

    return {
      success: true,
      filesChanged: [file],
      description: `Renamed field '${field}' to '${name}' on class '${target}' (${referenceCount} external reference(s) updated)`,
    };
  },
});
