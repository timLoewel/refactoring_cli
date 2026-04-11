import type { Identifier, Node as TsNode, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind, ts } from "ts-morph";
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

/**
 * Returns the body (Block node) of the nearest enclosing function/method, or
 * undefined if the node is at module level.
 */
function getEnclosingFunctionBody(node: TsNode): TsNode | undefined {
  let current = node.getParent();
  while (current) {
    if (Node.isFunctionDeclaration(current)) return current.getBody();
    if (Node.isMethodDeclaration(current)) return current.getBody();
    if (Node.isFunctionExpression(current)) return current.getBody();
    if (Node.isArrowFunction(current)) return current.getBody();
    if (Node.isConstructorDeclaration(current)) return current.getBody();
    if (Node.isGetAccessorDeclaration(current)) return current.getBody();
    if (Node.isSetAccessorDeclaration(current)) return current.getBody();
    current = current.getParent();
  }
  return undefined;
}

/**
 * Returns the enclosing function body if the identifier is a block-scoped
 * local variable (const/let inside a function), or undefined otherwise.
 */
function getLocalVariableScope(nameNode: Identifier): TsNode | undefined {
  const decl = nameNode.getParent();
  if (!Node.isVariableDeclaration(decl)) return undefined;
  const declList = decl.getParent();
  if (!declList || !Node.isVariableDeclarationList(declList)) return undefined;
  if (declList.getDeclarationKind() === VariableDeclarationKind.Var) return undefined;
  return getEnclosingFunctionBody(nameNode);
}

/**
 * Returns the enclosing function node (not just the body) if the identifier is
 * a parameter of a function-like declaration. The full function node is returned
 * so that the parameter declaration itself is within the rename scope.
 */
function getParameterFunctionScope(nameNode: Identifier): TsNode | undefined {
  const decl = nameNode.getParent();
  if (!Node.isParameterDeclaration(decl)) return undefined;
  const funcNode = decl.getParent();
  if (!funcNode) return undefined;
  if (
    Node.isFunctionDeclaration(funcNode) ||
    Node.isMethodDeclaration(funcNode) ||
    Node.isFunctionExpression(funcNode) ||
    Node.isArrowFunction(funcNode) ||
    Node.isConstructorDeclaration(funcNode) ||
    Node.isGetAccessorDeclaration(funcNode) ||
    Node.isSetAccessorDeclaration(funcNode)
  ) {
    return funcNode;
  }
  return undefined;
}

/**
 * Whether there is another declaration (variable or parameter) with the same
 * name in the scope, which would make AST-walk renaming incorrect.
 */
function hasLocalShadowing(scope: TsNode, name: string, declNode: Identifier): boolean {
  for (const varDecl of scope.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = varDecl.getNameNode();
    if (Node.isIdentifier(nameNode) && nameNode !== declNode && nameNode.getText() === name) {
      return true;
    }
  }
  for (const paramDecl of scope.getDescendantsOfKind(SyntaxKind.Parameter)) {
    const nameNode = paramDecl.getNameNode();
    if (Node.isIdentifier(nameNode) && nameNode !== declNode && nameNode.getText() === name) {
      return true;
    }
  }
  return false;
}

/**
 * Rename a block-scoped local variable by walking the AST instead of using
 * the TypeScript language service. This avoids the expensive type resolution
 * that can time out on projects with complex types (e.g. ts-pattern).
 */
function renameBlockScopedLocal(
  sf: SourceFile,
  scope: TsNode,
  target: string,
  newName: string,
): void {
  const replacements: { start: number; end: number; text: string }[] = [];

  for (const id of scope.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() !== target) continue;

    const parent = id.getParent();

    // Skip property access names (obj.handler)
    if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) continue;

    // Skip non-shorthand property assignment names ({ handler: value })
    if (Node.isPropertyAssignment(parent) && parent.getNameNode() === id) continue;

    // Skip property name in binding pattern ({ handler: alias })
    if (Node.isBindingElement(parent) && parent.getPropertyNameNode() === id) continue;

    // Skip member names in type/class declarations
    if (Node.isPropertySignature(parent) && parent.getNameNode() === id) continue;
    if (Node.isPropertyDeclaration(parent) && parent.getNameNode() === id) continue;
    if (
      (Node.isMethodDeclaration(parent) ||
        Node.isMethodSignature(parent) ||
        Node.isGetAccessorDeclaration(parent) ||
        Node.isSetAccessorDeclaration(parent)) &&
      parent.getNameNode() === id
    ) continue;

    // Skip labels (different namespace from variables)
    const parentKind = parent?.getKind();
    if (
      parentKind === SyntaxKind.LabeledStatement ||
      parentKind === SyntaxKind.BreakStatement ||
      parentKind === SyntaxKind.ContinueStatement
    ) continue;

    // Shorthand property assignment ({ handler }) → ({ handler: newName })
    if (Node.isShorthandPropertyAssignment(parent)) {
      replacements.push({
        start: parent.getStart(),
        end: parent.getEnd(),
        text: `${parent.getName()}: ${newName}`,
      });
      continue;
    }

    replacements.push({ start: id.getStart(), end: id.getEnd(), text: newName });
  }

  // Apply replacements in reverse order to preserve positions
  replacements.sort((a, b) => b.start - a.start);
  let text = sf.getFullText();
  for (const r of replacements) {
    text = text.substring(0, r.start) + r.text + text.substring(r.end);
  }
  sf.replaceWithText(text);
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

      // Reject when the target name maps to multiple declaration sites (variables
      // and/or parameters) in the file. findNameNode returns the first match, so
      // the caller cannot control which declaration gets renamed.
      const varDeclCount = sf
        .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
        .filter((d) => d.getName() === target).length;
      const paramDeclCount = sf
        .getDescendantsOfKind(SyntaxKind.Parameter)
        .filter((p) => {
          if (isTypeOnlyParameter(p)) return false;
          const n = p.getNameNode();
          return Node.isIdentifier(n) && n.getText() === target;
        }).length;
      if (varDeclCount + paramDeclCount > 1) {
        errors.push(
          `Multiple declarations of '${target}' found in file. Rename is ambiguous without positional context to disambiguate.`,
        );
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
      const oldName = nameNode.getText();
      nameNode.replaceWithText(name);

      // If the parent function type has a type predicate return type
      // (e.g. `(value: unknown) => value is string`), the predicate's
      // parameter name must also be updated to match the renamed parameter.
      const paramDecl = nameNode.getParent();
      const sigNode = paramDecl?.getParent();
      if (sigNode) {
        const predicate = sigNode.getDescendantsOfKind(SyntaxKind.TypePredicate)[0];
        if (predicate) {
          const predIdent = predicate.getFirstChildByKind(SyntaxKind.Identifier);
          if (predIdent && predIdent.getText() === oldName) {
            predIdent.replaceWithText(name);
          }
        }
      }
    } else {
      // For block-scoped local variables (const/let inside a function body)
      // or function parameters, without shadowing, use a fast AST-walk rename
      // instead of the language service, which can time out on projects with
      // complex types.
      const localScope = getLocalVariableScope(nameNode);
      const paramScope = localScope ? undefined : getParameterFunctionScope(nameNode);
      const fastScope = localScope ?? paramScope;
      if (fastScope && !hasLocalShadowing(fastScope, target, nameNode)) {
        renameBlockScopedLocal(sf, fastScope, target, name);
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

      // Count declaration sites per name so we can skip ambiguous targets
      const declCounts = new Map<string, number>();
      for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        const name = decl.getName();
        if (name) declCounts.set(name, (declCounts.get(name) ?? 0) + 1);
      }
      for (const p of sf.getDescendantsOfKind(SyntaxKind.Parameter)) {
        if (isTypeOnlyParameter(p)) continue;
        const nameNode = p.getNameNode();
        if (Node.isIdentifier(nameNode)) {
          const name = nameNode.getText();
          declCounts.set(name, (declCounts.get(name) ?? 0) + 1);
        }
      }

      const seen = new Set<string>();
      for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        const name = decl.getName();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        if ((declCounts.get(name) ?? 0) > 1) continue;
        const varStmt = decl.getParent()?.getParent();
        if (varStmt && Node.isVariableStatement(varStmt) && varStmt.isExported()) continue;
        candidates.push({ file, target: name });
      }
      for (const p of sf.getDescendantsOfKind(SyntaxKind.Parameter)) {
        if (isTypeOnlyParameter(p)) continue;
        const nameNode = p.getNameNode();
        if (Node.isIdentifier(nameNode)) {
          const name = nameNode.getText();
          if (seen.has(name)) continue;
          seen.add(name);
          if ((declCounts.get(name) ?? 0) > 1) continue;
          candidates.push({ file, target: name });
        }
      }
    }
    return candidates;
  },
});
