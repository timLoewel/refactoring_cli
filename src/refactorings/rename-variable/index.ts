import type { Identifier, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
  SourceFileContext,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";

function findNameNode(sf: SourceFile, target: string): Identifier | undefined {
  const varDecl = sf
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((d) => d.getName() === target);
  if (varDecl) {
    const nameNode = varDecl.getNameNode();
    return Node.isIdentifier(nameNode) ? nameNode : undefined;
  }

  const paramDecl = sf.getDescendantsOfKind(SyntaxKind.Parameter).find((p) => {
    const n = p.getNameNode();
    return Node.isIdentifier(n) && n.getText() === target;
  });
  if (paramDecl) {
    const nameNode = paramDecl.getNameNode();
    return Node.isIdentifier(nameNode) ? nameNode : undefined;
  }

  return undefined;
}

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

    if (!findNameNode(sf, target)) {
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

    const nameNode = findNameNode(sf, target);

    if (!nameNode) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' not found`,
      };
    }

    nameNode.rename(name);

    return {
      success: true,
      filesChanged: [file],
      description: `Renamed variable '${target}' to '${name}' across all references`,
    };
  },
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        const name = decl.getName();
        if (name) candidates.push({ file, target: name });
      }
      for (const p of sf.getDescendantsOfKind(SyntaxKind.Parameter)) {
        const nameNode = p.getNameNode();
        if (Node.isIdentifier(nameNode)) {
          candidates.push({ file, target: nameNode.getText() });
        }
      }
    }
    return candidates;
  },
});
