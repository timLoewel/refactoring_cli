import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

function buildNewClassText(fieldDeclarations: string[], newClassName: string): string {
  const fieldsText = fieldDeclarations.join("\n  ");
  return `\nclass ${newClassName} {\n  ${fieldsText}\n}\n`;
}

export const extractClass = defineRefactoring<ClassContext>({
  name: "Extract Class",
  kebabName: "extract-class",
  tier: 3,
  description:
    "Extracts a set of fields from a class into a new class and adds a delegate field to the original.",
  params: [
    param.file(),
    param.identifier("target", "Name of the source class"),
    param.string("fields", "Comma-separated field names to extract"),
    param.identifier("newClassName", "Name for the new extracted class"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(ctx: ClassContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const fields = params["fields"] as string;
    const newClassName = params["newClassName"] as string;
    const { cls, sourceFile: sf } = ctx;

    const fieldNames = fields
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    for (const fieldName of fieldNames) {
      const found = cls.getProperty(fieldName);
      if (!found) {
        errors.push(`Field '${fieldName}' not found on class '${params["target"] as string}'`);
      }
    }

    const existing = sf
      .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
      .find((c) => c.getName() === newClassName);
    if (existing) {
      errors.push(`Class '${newClassName}' already exists in file`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const fields = params["fields"] as string;
    const newClassName = params["newClassName"] as string;
    const { cls: sourceClass } = ctx;

    const fieldNames = fields
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    const fieldDeclarations: string[] = [];

    for (const fieldName of fieldNames) {
      const prop = sourceClass.getProperty(fieldName);
      if (prop) {
        fieldDeclarations.push(prop.getText());
        prop.remove();
      }
    }

    const delegateFieldName = newClassName.charAt(0).toLowerCase() + newClassName.slice(1);
    sourceClass.addProperty({
      name: delegateFieldName,
      type: newClassName,
      initializer: `new ${newClassName}()`,
    });

    sf.addStatements(buildNewClassText(fieldDeclarations, newClassName));

    return {
      success: true,
      filesChanged: [file],
      description: `Extracted fields [${fieldNames.join(", ")}] from '${target}' into new class '${newClassName}'`,
    };
  },
});
