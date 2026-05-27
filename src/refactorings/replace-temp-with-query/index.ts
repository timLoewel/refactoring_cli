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
import { findReferencedTypeParams } from "../../core/type-params.js";

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
  if (text.includes("import(") || text.startsWith("typeof import(") || text === "")
    return "unknown";
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

    // Reject if the variable is mutated after initialization (method calls on the
    // object, property assignments, reassignment). Replacing with a function would
    // create a fresh value at each call site, losing the mutations.
    if (decl) {
      const declKind = decl.getParent()?.getKind();
      const isConst =
        declKind === SyntaxKind.VariableDeclarationList &&
        decl.getParent()?.getChildrenOfKind(SyntaxKind.ConstKeyword).length === 0 &&
        decl.getParent()?.getText().startsWith("let");
      if (isConst) {
        errors.push(
          `Variable '${target}' is declared with 'let' and may be reassigned. ` +
            `Replace Temp with Query requires an immutable binding.`,
        );
      }

      // Check if the variable is used as a method-call receiver (object mutation)
      const declSymbol = decl.getSymbol();
      if (declSymbol) {
        const refs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
          if (id.getText() !== target) return false;
          return id.getSymbol() === declSymbol && isValueReference(id);
        });
        const isMutated = refs.some((ref) => {
          const parent = ref.getParent();
          // foo.bar() — method call on the variable
          if (parent && Node.isPropertyAccessExpression(parent) && parent.getExpression() === ref) {
            const grandparent = parent.getParent();
            if (
              grandparent &&
              Node.isCallExpression(grandparent) &&
              grandparent.getExpression() === parent
            ) {
              return true;
            }
            // foo.bar = x — property assignment
            const gp = parent.getParent();
            if (gp && Node.isBinaryExpression(gp) && gp.getLeft() === parent) {
              return true;
            }
          }
          return false;
        });
        if (isMutated) {
          errors.push(
            `Variable '${target}' is mutated after initialization (method calls or property assignments). ` +
              `Replacing with a function would create a fresh value at each call site, losing mutations.`,
          );
        }

        // `typeof target` references are rewritten to `ReturnType<typeof fn>`.
        // Two sub-cases cannot be rewritten faithfully:
        //  - complex type queries (`typeof target.member`, type-argument use),
        //    which are not a bare `typeof target`;
        //  - an un-annotated literal-typed temp, whose type would widen
        //    (e.g. `"foo"` -> `string`) once it flows through a function.
        const typeQueryRefs = refs.filter(
          (id) => id.getFirstAncestorByKind(SyntaxKind.TypeQuery) !== undefined,
        );
        const hasComplexTypeQuery = typeQueryRefs.some((id) => !Node.isTypeQuery(id.getParent()));
        if (hasComplexTypeQuery) {
          errors.push(
            `Variable '${target}' is used in a complex 'typeof' type query ` +
              `(e.g. 'typeof ${target}.member'), which cannot be rewritten as a query call.`,
          );
        } else if (typeQueryRefs.length > 0 && !decl.getTypeNode()) {
          const t = decl.getType();
          if (t.isStringLiteral() || t.isNumberLiteral() || t.isBooleanLiteral()) {
            errors.push(
              `Variable '${target}' has a literal type and is used in a 'typeof' type query. ` +
                `Replacing it with a query function would widen the type and change the assertion.`,
            );
          }
        }
      }
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
    // Propagate type parameters from enclosing generic context BEFORE mutations
    const typeParamsArr = findReferencedTypeParams(decl);
    const typeParams = typeParamsArr.length > 0 ? typeParamsArr[0] : "";

    // Check for await BEFORE mutations invalidate the initializer node
    const hasAwait =
      initializer.getKind() === SyntaxKind.AwaitExpression ||
      initializer.getDescendantsOfKind(SyntaxKind.AwaitExpression).length > 0;
    const asyncPrefix = hasAwait ? "async " : "";
    const wrappedRetType = hasAwait ? `Promise<${retType}>` : retType;
    const callExpr = hasAwait ? `await ${funcName}(${funcArgs})` : `${funcName}(${funcArgs})`;

    // Replace only identifier references that resolve to the SAME declaration.
    // Other variables with the same name in different scopes must not be touched.
    const declSymbol = decl.getSymbol();
    const matchingIds = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
      if (id.getText() !== target) return false;
      const refSymbol = id.getSymbol();
      return refSymbol !== undefined && refSymbol === declSymbol;
    });

    // A `typeof target` reference lives in a type position, where a call
    // expression is illegal. The type of the temp equals the query function's
    // return type, so rewrite `typeof target` as `ReturnType<typeof fn>`
    // (unwrapping the Promise when the query is async).
    const typeQueryReplacement = hasAwait
      ? `Awaited<ReturnType<typeof ${funcName}>>`
      : `ReturnType<typeof ${funcName}>`;

    const replacements: { node: Node; text: string; fallback?: string }[] = [];
    for (const id of matchingIds) {
      const typeQuery = id.getFirstAncestorByKind(SyntaxKind.TypeQuery);
      if (typeQuery) {
        // Only simple `typeof target` is handled (preconditions reject the rest).
        if (Node.isTypeQuery(id.getParent())) {
          replacements.push({ node: typeQuery, text: typeQueryReplacement });
        }
      } else if (isValueReference(id)) {
        replacements.push({
          node: id,
          text: callExpr,
          fallback: `${funcName}(${funcArgs})`,
        });
      }
    }

    // Replace from the end of the file backwards so earlier offsets stay valid.
    replacements.sort((a, b) => b.node.getStart() - a.node.getStart());
    for (const { node, text, fallback } of replacements) {
      try {
        node.replaceWithText(text);
      } catch {
        // Fallback: try without await if the replacement fails (e.g. non-async context)
        if (fallback !== undefined) {
          try {
            node.replaceWithText(fallback);
          } catch {
            // Skip this reference if replacement is not possible
          }
        }
      }
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
      `${asyncPrefix}function ${funcName}${typeParams}(${paramList}): ${wrappedRetType} {\n  return ${initText};\n}\n`,
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
