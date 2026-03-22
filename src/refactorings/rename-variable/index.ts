import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

export const renameVariable = defineRefactoring<SourceFileContext>({
  name: "Rename Variable",
  kebabName: "rename-variable",
  tier: 1,
  description:
    "Renames a variable and all its references using ts-morph's rename, ensuring scope-aware renaming.",
  params: [
    param.file(),
    param.identifier("target", "Current name of the variable to rename"),
    param.identifier("name", "New name for the variable"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const name = params["name"] as string;

    const decl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!decl) {
      errors.push(`Variable '${target}' not found in file`);
    }

    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      errors.push(`'${name}' is not a valid identifier`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const name = params["name"] as string;

    const decl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!decl) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' not found`,
      };
    }

    // ts-morph rename propagates to all references in scope.
    // getNameNode() returns BindingName which may be a destructuring pattern;
    // we only support simple identifier declarations.
    const nameNode = decl.getNameNode();
    if (!Node.isIdentifier(nameNode)) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' uses destructuring and cannot be renamed with this refactoring`,
      };
    }
    nameNode.rename(name);

    return {
      success: true,
      filesChanged: [file],
      description: `Renamed variable '${target}' to '${name}' across all references`,
    };
  },
});
