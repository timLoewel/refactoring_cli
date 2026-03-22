import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

export const replaceDerivedVariableWithQuery = defineRefactoring<SourceFileContext>({
  name: "Replace Derived Variable With Query",
  kebabName: "replace-derived-variable-with-query",
  tier: 2,
  description: "Replaces a class field that holds a derived value with a computed getter method.",
  params: [
    param.file(),
    param.identifier(
      "target",
      "Name of the derived variable or class field to convert into a getter",
    ),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;

    // Look for the field in any class in the file
    const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
    const found = classes.some((cls) => {
      const prop = cls.getProperty(target);
      return prop !== undefined;
    });

    if (!found) {
      errors.push(`No class property named '${target}' found in file`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;

    const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
    let converted = false;

    for (const cls of classes) {
      const prop = cls.getProperty(target);
      if (!prop) continue;

      const initializer = prop.getInitializer();
      if (!initializer) continue;

      const typeNode = prop.getTypeNode();
      const returnType = typeNode ? typeNode.getText() : "unknown";
      const initText = initializer.getText();

      // Add a getter that computes the value
      cls.addGetAccessor({
        name: target,
        returnType,
        statements: `return ${initText};`,
      });

      // Remove the original property
      prop.remove();

      converted = true;
      break;
    }

    if (!converted) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not find property '${target}' with an initializer to convert`,
      };
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Converted derived field '${target}' into a computed getter`,
    };
  },
});
