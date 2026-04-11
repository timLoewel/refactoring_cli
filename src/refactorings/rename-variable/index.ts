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
    } else {
      // Reject renaming exported variables — external consumers import by name
      const varDecl = sf
        .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
        .find((d) => d.getName() === target);
      if (varDecl) {
        const varStmt = varDecl.getParent()?.getParent();
        if (varStmt && Node.isVariableStatement(varStmt) && varStmt.isExported()) {
          errors.push(
            `Variable '${target}' is exported. Renaming would break external consumers that import it by name.`,
          );
        }
      }
    }

    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      errors.push(`'${name}' is not a valid identifier`);
    }

    // Reject if the new name already exists in the file — ts-morph's rename
    // adds numeric suffixes (e.g. __reftest__2) to resolve collisions but
    // doesn't update all references correctly, breaking runtime behavior.
    if (name !== target) {
      const nameCollision = sf
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .some((id) => id.getText() === name);
      if (nameCollision) {
        errors.push(
          `Name '${name}' already exists in the file. Renaming '${target}' to '${name}' would create a collision.`,
        );
      }
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

    // Expand shorthand property assignments (e.g. `{ message }`) before renaming,
    // so the property key is preserved: `{ message }` → `{ message: message }` → `{ message: newName }`
    const refs = nameNode.findReferencesAsNodes();
    for (const ref of refs) {
      const parent = ref.getParent();
      if (Node.isShorthandPropertyAssignment(parent)) {
        const propName = parent.getName();
        parent.replaceWithText(propName + ": " + propName);
      }
    }

    // Re-resolve the name node since tree mutations may have invalidated it
    const freshNameNode = findNameNode(sf, target);
    if (freshNameNode) {
      freshNameNode.rename(name);
    }

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
        if (!name) continue;
        const varStmt = decl.getParent()?.getParent();
        if (varStmt && Node.isVariableStatement(varStmt) && varStmt.isExported()) continue;
        candidates.push({ file, target: name });
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
