import { Node, SyntaxKind } from "ts-morph";
import type {
  Identifier,
  ParameterDeclaration,
  Project,
  SourceFile,
  VariableDeclaration,
} from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
  SourceFileContext,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";

/** True if the identifier is used as a value, not as a property/declaration name. */
function isValueReference(id: Identifier): boolean {
  const parent = id.getParent();
  if (!parent) return false;
  if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) return false;
  if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
  if (Node.isBindingElement(parent) && parent.getNameNode() === id) return false;
  if (Node.isFunctionDeclaration(parent) && parent.getNameNode() === id) return false;
  if (Node.isMethodDeclaration(parent) && parent.getNameNode() === id) return false;
  // Parameter declarations: `(foo) => {}` — `foo` is a binding, not a reference
  if (Node.isParameterDeclaration(parent) && parent.getNameNode() === id) return false;
  return true;
}

/** Get a type string, widening literal types to their base. */
function getWidenedType(decl: VariableDeclaration | ParameterDeclaration): string {
  const typeNode = decl.getTypeNode();
  if (typeNode) return typeNode.getText();
  const t = decl.getType();
  if (t.isStringLiteral()) return "string";
  if (t.isNumberLiteral()) return "number";
  if (t.isBooleanLiteral()) return "boolean";
  const text = t.getText(decl);
  if (text.includes("import(") || text.startsWith("typeof ") || text === "") return "unknown";
  return text;
}

/**
 * Find identifiers in the initializer that refer to variables declared inside
 * a function body (not accessible from a top-level extracted function).
 * These become parameters of the extracted query function.
 */
function findParamsForInitializer(
  initializer: ReturnType<VariableDeclaration["getInitializer"]>,
  sf: SourceFile,
): { name: string; type: string }[] {
  if (!initializer) return [];

  const result = new Map<string, string>();
  const initStart = initializer.getStart();
  const initEnd = initializer.getEnd();

  for (const id of initializer.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!isValueReference(id)) continue;

    const sym = id.getSymbol();
    if (!sym) continue;

    const decls = sym.getDeclarations();
    if (!decls || decls.length === 0) continue;

    // Only declarations in this source file
    const sfDecls = decls.filter((d) => d.getSourceFile() === sf);
    if (sfDecls.length === 0) continue;

    // Skip declarations that are WITHIN the initializer (e.g., arrow function params)
    const anyInsideInit = sfDecls.some((d) => {
      const pos = d.getStart();
      return pos >= initStart && pos <= initEnd;
    });
    if (anyInsideInit) continue;

    // Only include declarations that are inside a function body (not file-level).
    // Top-level declarations are accessible from the extracted function; local ones are not.
    const firstDecl = sfDecls[0];
    if (!firstDecl) continue;

    const insideFunction = firstDecl
      .getAncestors()
      .some(
        (a) =>
          Node.isFunctionDeclaration(a) ||
          Node.isArrowFunction(a) ||
          Node.isFunctionExpression(a) ||
          Node.isMethodDeclaration(a),
      );
    if (!insideFunction) continue;

    const varName = id.getText();
    if (result.has(varName)) continue;

    let typeStr = "unknown";
    if (Node.isVariableDeclaration(firstDecl)) {
      typeStr = getWidenedType(firstDecl);
    } else if (Node.isParameterDeclaration(firstDecl)) {
      typeStr = getWidenedType(firstDecl);
    }

    result.set(varName, typeStr);
  }

  return Array.from(result.entries()).map(([name, type]) => ({ name, type }));
}

export const replaceTempWithQuery = defineRefactoring<SourceFileContext>({
  name: "Replace Temp with Query",
  kebabName: "replace-temp-with-query",
  tier: 1,
  description:
    "Replaces a temporary variable with a call to a new extracted query function that computes the same value.",
  params: [
    param.file(),
    param.identifier("target", "Name of the temporary variable to replace"),
    param.identifier("name", "Name for the new query function"),
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
      return { ok: false, errors };
    }

    const initializer = decl.getInitializer();
    if (!initializer) {
      errors.push(`Variable '${target}' has no initializer`);
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
    const funcName = params["name"] as string;

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

    const initializer = decl.getInitializer();
    if (!initializer) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' has no initializer`,
      };
    }

    const initText = initializer.getText();
    const retType = getWidenedType(decl);
    const funcParams = findParamsForInitializer(initializer, sf);
    const paramList = funcParams.map((p) => `${p.name}: ${p.type}`).join(", ");
    const funcArgs = funcParams.map((p) => p.name).join(", ");
    // Check for await BEFORE mutations invalidate the initializer node
    const hasAwait =
      initializer.getKind() === SyntaxKind.AwaitExpression ||
      initializer.getDescendantsOfKind(SyntaxKind.AwaitExpression).length > 0;
    const asyncPrefix = hasAwait ? "async " : "";
    const wrappedRetType = hasAwait ? `Promise<${retType}>` : retType;
    const callExpr = hasAwait ? `await ${funcName}(${funcArgs})` : `${funcName}(${funcArgs})`;

    // Replace all identifier references to the temp variable with a call
    const references = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
      if (id.getText() !== target) return false;
      return isValueReference(id);
    });

    const sorted = [...references].sort((a, b) => b.getStart() - a.getStart());
    for (const ref of sorted) {
      ref.replaceWithText(callExpr);
    }

    // Remove the temp variable declaration
    const declStatement = decl.getParent();
    if (declStatement) {
      if (Node.isVariableDeclarationList(declStatement)) {
        const listParent = declStatement.getParent();
        if (listParent && Node.isVariableStatement(listParent)) {
          listParent.remove();
        }
      } else if (Node.isVariableStatement(declStatement)) {
        declStatement.remove();
      }
    }

    // Insert query function at the top of the source file
    sf.insertStatements(
      0,
      `${asyncPrefix}function ${funcName}(${paramList}): ${wrappedRetType} {\n  return ${initText};\n}\n`,
    );

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced temp variable '${target}' with query function '${funcName}()'`,
    };
  },
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        if (!decl.getInitializer()) continue;
        const name = decl.getName();
        if (name) candidates.push({ file, target: name });
      }
    }
    return candidates;
  },
});
