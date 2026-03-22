import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  identifierParam,
  resolveSourceFile,
} from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

export const moveField = defineRefactoring<SourceFileContext>({
  name: "Move Field",
  kebabName: "move-field",
  tier: 3,
  description: "Moves a field declaration from one class to another class within the same file.",
  params: [
    fileParam(),
    identifierParam("target", "Name of the source class"),
    identifierParam("field", "Name of the field to move"),
    identifierParam("destination", "Name of the destination class"),
  ],
  resolve: (project, params) =>
    resolveSourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;
    const destination = params["destination"] as string;

    const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);

    const sourceClass = classes.find((c) => c.getName() === target);
    if (!sourceClass) {
      errors.push(`Class '${target}' not found in file: ${file}`);
      return { ok: false, errors };
    }

    const prop = sourceClass.getProperty(field);
    if (!prop) {
      errors.push(`Field '${field}' not found on class '${target}'`);
    }

    const destClass = classes.find((c) => c.getName() === destination);
    if (!destClass) {
      errors.push(`Destination class '${destination}' not found in file: ${file}`);
      return { ok: false, errors };
    }

    const existingProp = destClass.getProperty(field);
    if (existingProp) {
      errors.push(`Field '${field}' already exists on class '${destination}'`);
    }

    if (target === destination) {
      errors.push("'target' and 'destination' must be different classes");
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;
    const destination = params["destination"] as string;

    const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
    const sourceClass = classes.find((c) => c.getName() === target);
    const destClass = classes.find((c) => c.getName() === destination);

    if (!sourceClass || !destClass) {
      return {
        success: false,
        filesChanged: [],
        description: "Source or destination class not found",
      };
    }

    const prop = sourceClass.getProperty(field);
    if (!prop) {
      return {
        success: false,
        filesChanged: [],
        description: `Field '${field}' not found on class '${target}'`,
      };
    }

    const propText = prop.getText();
    prop.remove();
    destClass.addMember(propText);

    return {
      success: true,
      filesChanged: [file],
      description: `Moved field '${field}' from class '${target}' to class '${destination}'`,
    };
  },
});
