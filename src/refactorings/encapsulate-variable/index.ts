import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

function buildAccessorFunctions(varName: string, typeText: string, initializer: string): string {
  const capitalized = varName.charAt(0).toUpperCase() + varName.slice(1);
  return (
    `\nlet _${varName}: ${typeText} = ${initializer};\n\n` +
    `export function get${capitalized}(): ${typeText} {\n  return _${varName};\n}\n\n` +
    `export function set${capitalized}(value: ${typeText}): void {\n  _${varName} = value;\n}\n`
  );
}

export const encapsulateVariable = defineRefactoring<SourceFileContext>({
  name: "Encapsulate Variable",
  kebabName: "encapsulate-variable",
  tier: 3,
  description:
    "Replaces a module-level variable with a pair of exported getter and setter functions.",
  params: [
    param.file(),
    param.identifier("target", "Name of the module-level variable to encapsulate"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const file = params["file"] as string;

    const varDecl = sf.getVariableDeclaration(target);
    if (!varDecl) {
      errors.push(`Variable '${target}' not found at module level in file: ${file}`);
      return { ok: false, errors };
    }

    // If the variable is exported it may be imported by other files under its original name.
    // Renaming it to a getter breaks those callers, so skip exported variables.
    const varStmt = varDecl.getParent()?.getParent();
    if (varStmt && Node.isVariableStatement(varStmt) && varStmt.isExported()) {
      errors.push(
        `Variable '${target}' is exported and may be imported by other files. ` +
          `Encapsulating it would break those imports.`,
      );
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;

    const varDecl = sf.getVariableDeclaration(target);
    if (!varDecl) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' not found`,
      };
    }

    const typeNode = varDecl.getTypeNode();
    const typeText = typeNode?.getText() ?? "unknown";
    const initializer = varDecl.getInitializer()?.getText() ?? "undefined";

    const varStatement = varDecl.getParent()?.getParent();
    if (varStatement && varStatement.getKind() === SyntaxKind.VariableStatement) {
      varStatement.replaceWithText(buildAccessorFunctions(target, typeText, initializer));
    } else {
      return {
        success: false,
        filesChanged: [],
        description: `Could not locate the variable statement for '${target}'`,
      };
    }

    // Replace all remaining references to the original variable name with a call to the getter.
    // Build getter name: get + capitalized first letter + rest.
    const getterName = "get" + target.charAt(0).toUpperCase() + target.slice(1) + "()";
    const refs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
      if (id.getText() !== target) return false;
      const parent = id.getParent();
      if (!parent) return false;
      // Skip declaration names (including the new backing field `_target`)
      if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
      // Skip function/method definition names
      if (Node.isFunctionDeclaration(parent) && parent.getNameNode() === id) return false;
      // Skip property access right-hand side names (obj.foo)
      if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) return false;
      // Skip parameter bindings (e.g. the `(target) =>` in a callback)
      if (Node.isParameterDeclaration(parent) && parent.getNameNode() === id) return false;
      // Skip identifiers shadowed by a closer parameter of the same name
      let anc: ReturnType<typeof id.getParent> = id.getParent();
      while (anc) {
        if (
          Node.isArrowFunction(anc) ||
          Node.isFunctionDeclaration(anc) ||
          Node.isFunctionExpression(anc) ||
          Node.isMethodDeclaration(anc)
        ) {
          if (
            anc.getParameters().some((p) => {
              const n = p.getNameNode();
              return Node.isIdentifier(n) && n.getText() === target;
            })
          )
            return false;
        }
        const next = anc.getParent();
        if (!next) break;
        anc = next;
      }
      return true;
    });
    const sorted = [...refs].sort((a, b) => b.getStart() - a.getStart());
    for (const ref of sorted) {
      ref.replaceWithText(getterName);
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Encapsulated variable '${target}' with get/set accessor functions`,
    };
  },
  enumerate: enumerate.variables,
});
