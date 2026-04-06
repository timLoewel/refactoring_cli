import {
  Node,
  SyntaxKind,
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  type Project,
  type SourceFile,
} from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
  SourceFileContext,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";

type FunctionLike = FunctionDeclaration | ArrowFunction | FunctionExpression;

interface FunctionInfo {
  paramNames: string[];
  paramDefaults: (string | undefined)[];
  /** Non-null when body is a single expression (arrow function without block). */
  bodyExpression: string | null;
  /** Non-null when body is a block. */
  bodyStatements: string[] | null;
  /** Non-null when body is a block with exactly one `return <expr>` statement. */
  singleReturnExpr: string | null;
  isGenerator: boolean;
  isAsync: boolean;
  isRecursive: boolean;
  remove: () => void;
}

function extractFunctionInfo(
  fn: FunctionLike,
  name: string,
  isGenerator: boolean,
  isAsync: boolean,
  remove: () => void,
): FunctionInfo {
  const parameters = fn.getParameters();
  const paramNames = parameters.map((p) => {
    const n = p.getNameNode();
    return Node.isIdentifier(n) ? n.getText() : "";
  });
  const paramDefaults = parameters.map((p) => p.getInitializer()?.getText());

  const body = fn.getBody();

  let bodyExpression: string | null = null;
  let bodyStatements: string[] | null = null;
  let singleReturnExpr: string | null = null;

  if (body && !Node.isBlock(body)) {
    // Arrow function expression body
    bodyExpression = body.getText();
  } else if (body && Node.isBlock(body)) {
    const stmts = body.getStatements();
    bodyStatements = stmts.map((s) => s.getText());
    if (stmts.length === 1) {
      const retExpr = stmts[0]?.asKind(SyntaxKind.ReturnStatement)?.getExpression();
      if (retExpr) singleReturnExpr = retExpr.getText();
    }
  }

  const bodyText = bodyExpression ?? bodyStatements?.join("\n") ?? "";
  const isRecursive = new RegExp(`\\b${name}\\b`).test(bodyText);

  return {
    paramNames,
    paramDefaults,
    bodyExpression,
    bodyStatements,
    singleReturnExpr,
    isGenerator,
    isAsync,
    isRecursive,
    remove,
  };
}

function findFunction(sf: SourceFile, target: string): FunctionInfo | null {
  // Try FunctionDeclaration
  const funcDecl = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === target);
  if (funcDecl) {
    return extractFunctionInfo(funcDecl, target, funcDecl.isGenerator(), funcDecl.isAsync(), () =>
      funcDecl.remove(),
    );
  }

  // Try VariableDeclaration with ArrowFunction or FunctionExpression
  const varDecl = sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((d) => {
    if (d.getName() !== target) return false;
    const init = d.getInitializer();
    return init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init));
  });
  if (varDecl) {
    const init = varDecl.getInitializer();
    if (!init || (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init))) return null;
    const fnLike = init as ArrowFunction | FunctionExpression;
    const isAsync = fnLike.isAsync();
    const isGenerator = Node.isFunctionExpression(fnLike) ? fnLike.isGenerator() : false;
    const stmt = varDecl.getParent()?.getParent();
    return extractFunctionInfo(fnLike, target, isGenerator, isAsync, () => {
      if (stmt && Node.isVariableStatement(stmt)) stmt.remove();
    });
  }

  return null;
}

function substituteParams(
  text: string,
  paramNames: string[],
  args: string[],
  defaults: (string | undefined)[],
): string {
  let result = text;
  for (let i = 0; i < paramNames.length; i++) {
    const argText = i < args.length ? (args[i] ?? "undefined") : (defaults[i] ?? "undefined");
    result = result.replace(new RegExp(`\\b${paramNames[i]}\\b`, "g"), argText);
  }
  return result;
}

function canInlineAsExpression(info: FunctionInfo): boolean {
  return info.bodyExpression !== null || info.singleReturnExpr !== null;
}

function getInlineExpression(info: FunctionInfo, args: string[]): string {
  const expr = info.bodyExpression ?? info.singleReturnExpr ?? "";
  return substituteParams(expr, info.paramNames, args, info.paramDefaults);
}

export const inlineFunction = defineRefactoring<SourceFileContext>({
  name: "Inline Function",
  kebabName: "inline-function",
  tier: 2,
  description:
    "Replaces all call sites of a function with the function's body and removes the declaration.",
  params: [param.file(), param.identifier("target", "Name of the function to inline")],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;

    const info = findFunction(sf, target);
    if (!info) {
      errors.push(`Function '${target}' not found in file`);
      return { ok: false, errors };
    }

    if (info.isGenerator) {
      errors.push(`Function '${target}' is a generator and cannot be inlined`);
    }

    if (info.isRecursive) {
      errors.push(`Function '${target}' is recursive and cannot be inlined`);
    }

    if (errors.length > 0) return { ok: false, errors };

    // Collect direct call positions
    const directCallPositions = new Set(
      sf
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter((c) => {
          const expr = c.getExpression();
          return Node.isIdentifier(expr) && expr.getText() === target;
        })
        .map((c) => c.getExpression().getStart()),
    );

    // Require at least one call site in the same file; otherwise inlining would
    // just delete the function while leaving cross-file callers broken.
    if (directCallPositions.size === 0) {
      errors.push(`Function '${target}' has no call sites in this file and cannot be inlined here`);
      return { ok: false, errors };
    }

    // Check for non-direct-call usages (method calls, passed as value, etc.)
    const allUsages = sf
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter((id) => id.getText() === target);
    for (const id of allUsages) {
      const parent = id.getParent();
      // Skip the function's own name node in its declaration
      if (
        parent &&
        (Node.isFunctionDeclaration(parent) ||
          Node.isVariableDeclaration(parent) ||
          Node.isFunctionExpression(parent) ||
          Node.isArrowFunction(parent))
      ) {
        continue;
      }
      if (!directCallPositions.has(id.getStart())) {
        errors.push(
          `Function '${target}' is used in a non-call context (e.g., passed as value or ` +
            `accessed as method). All usages must be direct calls to inline.`,
        );
        break;
      }
    }

    if (errors.length > 0) return { ok: false, errors };

    // For multi-statement bodies, only ExpressionStatement call sites can be inlined
    if (!canInlineAsExpression(info)) {
      const callSites = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
        const expr = c.getExpression();
        return Node.isIdentifier(expr) && expr.getText() === target;
      });
      for (const call of callSites) {
        if (!Node.isExpressionStatement(call.getParent())) {
          errors.push(
            `Function '${target}' has a multi-statement body and is called in an expression ` +
              `position. Can only inline void functions called as standalone statements.`,
          );
          break;
        }
      }
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;

    const info = findFunction(sf, target);
    if (!info) {
      return { success: false, filesChanged: [], description: `Function '${target}' not found` };
    }

    const callSites = sf
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((c) => {
        const expr = c.getExpression();
        return Node.isIdentifier(expr) && expr.getText() === target;
      })
      .sort((a, b) => b.getStart() - a.getStart());

    if (canInlineAsExpression(info)) {
      // Replace each CallExpression node with the inlined expression
      for (const call of callSites) {
        const args = call.getArguments().map((a) => a.getText());
        call.replaceWithText(getInlineExpression(info, args));
      }
    } else {
      // Multi-statement void body: replace the parent ExpressionStatement
      const bodyStatements = info.bodyStatements ?? [];
      for (const call of callSites) {
        const callParent = call.getParent();
        if (!callParent || !Node.isExpressionStatement(callParent)) continue;
        const args = call.getArguments().map((a) => a.getText());
        const inlined = bodyStatements
          .map((s) => substituteParams(s, info.paramNames, args, info.paramDefaults))
          .join("\n");
        callParent.replaceWithText(inlined);
      }
    }

    // Re-find the function after mutations (original closure may be stale)
    const freshInfo = findFunction(sf, target);
    if (freshInfo) freshInfo.remove();

    // Remove named imports that are now unused after the function was deleted.
    const stillUsed = new Set<string>();
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      let insideImport = false;
      let anc: ReturnType<typeof id.getParent> = id.getParent();
      while (anc) {
        if (Node.isImportDeclaration(anc)) {
          insideImport = true;
          break;
        }
        const next = anc.getParent();
        if (!next) break;
        anc = next;
      }
      if (!insideImport) stillUsed.add(id.getText());
    }
    for (const importDecl of [...sf.getImportDeclarations()]) {
      let removedAny = false;
      for (const spec of [...importDecl.getNamedImports()]) {
        const local = spec.getAliasNode()?.getText() ?? spec.getNameNode().getText();
        if (!stillUsed.has(local)) {
          spec.remove();
          removedAny = true;
        }
      }
      if (
        removedAny &&
        importDecl.getNamedImports().length === 0 &&
        !importDecl.getDefaultImport() &&
        !importDecl.getNamespaceImport()
      ) {
        importDecl.remove();
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Inlined function '${target}' at ${callSites.length} call site(s)`,
    };
  },
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
        const name = fn.getName();
        if (name) candidates.push({ file, target: name });
      }
      for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        const init = decl.getInitializer();
        if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
          const name = decl.getName();
          if (name) candidates.push({ file, target: name });
        }
      }
    }
    return candidates;
  },
});
