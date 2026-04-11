import type { Identifier, Node as TsNode, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind, ts } from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
  SourceFileContext,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";

/**
 * SyntaxKind values whose parameters are type-level only (no value references).
 * Renaming these parameters doesn't require the expensive language-service
 * operations (findReferencesAsNodes / rename) that trigger full type resolution.
 */
const TYPE_ONLY_PARAM_PARENTS = new Set([
  SyntaxKind.FunctionType,
  SyntaxKind.ConstructorType,
  SyntaxKind.CallSignature,
  SyntaxKind.ConstructSignature,
  SyntaxKind.MethodSignature,
  SyntaxKind.IndexSignature,
]);

function isTypeOnlyParameter(node: TsNode): boolean {
  const paramDecl = Node.isParameterDeclaration(node) ? node : node.getParent();
  if (!paramDecl || !Node.isParameterDeclaration(paramDecl)) return false;
  const parentKind = paramDecl.getParent()?.getKind();
  return parentKind !== undefined && TYPE_ONLY_PARAM_PARENTS.has(parentKind);
}

function removeUnusedTsExpectErrorDirectives(sf: SourceFile): void {
  const TS2578_UNUSED_EXPECT_ERROR = 2578;
  const diagnostics = sf.getPreEmitDiagnostics();
  const fullText = sf.getFullText();
  const lines = fullText.split("\n");
  const linesToRemove = new Set<number>();

  for (const d of diagnostics) {
    if (
      d.getCategory() === ts.DiagnosticCategory.Error &&
      d.getCode() === TS2578_UNUSED_EXPECT_ERROR
    ) {
      const start = d.getStart();
      if (start !== undefined) {
        const { line } = sf.getLineAndColumnAtPos(start);
        const lineIdx = line - 1;
        const lineText = lines[lineIdx];
        if (lineIdx >= 0 && lineIdx < lines.length && lineText !== undefined && lineText.trim().startsWith("//")) {
          linesToRemove.add(lineIdx);
        }
      }
    }
  }

  if (linesToRemove.size > 0) {
    const newText = lines.filter((_, i) => !linesToRemove.has(i)).join("\n");
    sf.replaceWithText(newText);
  }
}

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

    if (isTypeOnlyParameter(nameNode)) {
      // Type-level parameters (in function types, call signatures, etc.) have no
      // value references — skip findReferencesAsNodes / rename which trigger
      // expensive type resolution that can time out on complex type files.
      nameNode.replaceWithText(name);
    } else {
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
    }

    // Clean up any unused ts-expect-error directives that would cause
    // compilation errors — these may be pre-existing or caused by the rename.
    // Guard: only call getPreEmitDiagnostics when the file actually contains
    // such directives, since diagnostics triggers a full type-check that can
    // take tens of seconds on projects with complex types (e.g. ts-pattern).
    const TS_EXPECT_ERROR_DIRECTIVE = "@ts-expect-" + "error";
    if (sf.getFullText().includes(TS_EXPECT_ERROR_DIRECTIVE)) {
      removeUnusedTsExpectErrorDirectives(sf);
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
        if (isTypeOnlyParameter(p)) continue;
        const nameNode = p.getNameNode();
        if (Node.isIdentifier(nameNode)) {
          candidates.push({ file, target: nameNode.getText() });
        }
      }
    }
    return candidates;
  },
});
