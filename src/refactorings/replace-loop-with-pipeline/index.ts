import { SyntaxKind } from "ts-morph";
import type { Node, Project, Statement, VariableStatement } from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
  SourceFileContext,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";

function buildForEachReplacement(
  expression: string,
  varName: string,
  statementsText: string[],
): string {
  const bodyLines = statementsText.map((s) => `  ${s}`).join("\n");
  return `${expression}.forEach((${varName}) => {\n${bodyLines}\n});`;
}

function buildSinglePushReplacement(
  expression: string,
  varName: string,
  pushText: string,
  fallback: string,
): string {
  const pushMatch = pushText.match(/^(\w+)\.push\((.+)\);?$/s);
  if (!pushMatch) return fallback;

  const arrayName = pushMatch[1];
  const mappedExpr = pushMatch[2];
  if (mappedExpr === undefined) return fallback;
  if (mappedExpr.trim() === varName) return `const ${arrayName} = [...${expression}];`;
  return `const ${arrayName} = ${expression}.map((${varName}) => ${mappedExpr});`;
}

function tryBuildFilterReplacement(
  expression: string,
  varName: string,
  statements: Node[],
): string | null {
  if (statements.length !== 1) return null;
  const stmt = statements[0];
  if (!stmt || stmt.getKind() !== SyntaxKind.IfStatement) return null;

  const ifStmt = stmt.asKindOrThrow(SyntaxKind.IfStatement);
  if (ifStmt.getElseStatement()) return null;

  const thenBlock = ifStmt.getThenStatement().asKind(SyntaxKind.Block);
  if (!thenBlock) return null;

  const thenStatements = thenBlock.getStatements();
  if (thenStatements.length !== 1) return null;

  const thenStmt = thenStatements[0];
  const pushText = thenStmt?.getText().trim() ?? "";
  const pushMatch = pushText.match(/^(\w+)\.push\((.+)\);?$/s);
  if (!pushMatch) return null;

  const arrayName = pushMatch[1];
  const mappedExpr = pushMatch[2];
  if (arrayName === undefined || mappedExpr === undefined) return null;
  const condText = ifStmt.getExpression().getText();

  if (mappedExpr.trim() === varName) {
    return `const ${arrayName} = ${expression}.filter((${varName}) => ${condText});`;
  }
  return `const ${arrayName} = ${expression}.filter((${varName}) => ${condText}).map((${varName}) => ${mappedExpr});`;
}

function buildPipelineReplacement(expression: string, varName: string, statements: Node[]): string {
  const filterReplacement = tryBuildFilterReplacement(expression, varName, statements);
  if (filterReplacement) return filterReplacement;

  const statementsText = statements.map((s) => s.getText());
  const isPush = (text: string): boolean => /\w+\.push\(/.test(text);
  const pushCount = statementsText.filter(isPush).length;
  const fallback = buildForEachReplacement(expression, varName, statementsText);

  if (pushCount === statements.length && pushCount === 1) {
    const pushText = (statementsText.find(isPush) ?? "").trim();
    return buildSinglePushReplacement(expression, varName, pushText, fallback);
  }

  return fallback;
}

function hasBreakOrContinue(body: Node): boolean {
  return (
    body.getDescendantsOfKind(SyntaxKind.BreakStatement).length > 0 ||
    body.getDescendantsOfKind(SyntaxKind.ContinueStatement).length > 0
  );
}

function findPrecedingEmptyArrayDecl(loop: Node, arrayName: string): VariableStatement | undefined {
  const parent = loop.getParent();
  if (!parent) return undefined;

  let statements: Statement[];
  if (parent.getKind() === SyntaxKind.Block) {
    statements = parent.asKindOrThrow(SyntaxKind.Block).getStatements();
  } else if (parent.getKind() === SyntaxKind.SourceFile) {
    statements = parent.asKindOrThrow(SyntaxKind.SourceFile).getStatements();
  } else {
    return undefined;
  }

  const loopIndex = statements.indexOf(loop as Statement);
  if (loopIndex <= 0) return undefined;

  const preceding = statements[loopIndex - 1];
  if (!preceding || preceding.getKind() !== SyntaxKind.VariableStatement) return undefined;

  const varStmt = preceding as VariableStatement;
  const decls = varStmt.getDeclarations();
  if (decls.length !== 1) return undefined;

  const decl = decls[0];
  if (!decl || decl.getName() !== arrayName) return undefined;

  const init = decl.getInitializer();
  if (!init || init.getKind() !== SyntaxKind.ArrayLiteralExpression) return undefined;

  const arrayLit = init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  if (arrayLit.getElements().length !== 0) return undefined;

  return varStmt;
}

export const replaceLoopWithPipeline = defineRefactoring<SourceFileContext>({
  name: "Replace Loop With Pipeline",
  kebabName: "replace-loop-with-pipeline",
  tier: 2,
  description:
    "Replaces a for-of loop with an equivalent array pipeline using map, filter, or forEach.",
  params: [
    param.file(),
    param.string("target", "Line number of the for-of loop to replace (1-based)"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const targetStr = params["target"] as string;
    const lineNum = Number(targetStr);
    if (!Number.isInteger(lineNum) || lineNum < 1) {
      errors.push("param 'target' must be a positive integer line number");
      return { ok: false, errors };
    }

    const loop = sf
      .getDescendantsOfKind(SyntaxKind.ForOfStatement)
      .find((l) => l.getStartLineNumber() === lineNum);

    if (!loop) {
      errors.push(`No for-of loop found at line ${lineNum} in file`);
      return { ok: false, errors };
    }

    const body = loop.getChildrenOfKind(SyntaxKind.Block)[0];
    if (!body) {
      errors.push(`Loop at line ${lineNum} has no block body`);
      return { ok: false, errors };
    }

    const statements = body.getStatements();
    if (statements.length === 0) {
      errors.push(`Loop at line ${lineNum} has an empty body`);
    }

    if (hasBreakOrContinue(body)) {
      errors.push(
        `Loop at line ${lineNum} contains break or continue — cannot safely convert to pipeline`,
      );
    }

    if (body.getDescendantsOfKind(SyntaxKind.AwaitExpression).length > 0) {
      errors.push(`Loop at line ${lineNum} contains await — forEach callback cannot be async`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const lineNum = Number(params["target"] as string);

    const loop = sf
      .getDescendantsOfKind(SyntaxKind.ForOfStatement)
      .find((l) => l.getStartLineNumber() === lineNum);
    if (!loop) {
      return {
        success: false,
        filesChanged: [],
        description: `No for-of loop found at line ${lineNum}`,
      };
    }

    const body = loop.getChildrenOfKind(SyntaxKind.Block)[0];
    if (!body) {
      return { success: false, filesChanged: [], description: `Loop has no block body` };
    }

    const expression = loop.getExpression().getText();
    const varName = loop
      .getInitializer()
      .getText()
      .replace(/^(const|let|var)\s+/, "");
    const replacement = buildPipelineReplacement(expression, varName, body.getStatements());

    // When generating a const declaration (map/filter/spread), remove the preceding
    // empty array declaration to avoid a redeclaration conflict.
    let precedingDecl: VariableStatement | undefined;
    if (replacement.startsWith("const ")) {
      const nameMatch = replacement.match(/^const\s+(\w+)\s*=/);
      if (nameMatch) {
        const declName = nameMatch[1];
        if (declName) {
          precedingDecl = findPrecedingEmptyArrayDecl(loop, declName);
        }
      }
    }

    loop.replaceWithText(replacement);
    precedingDecl?.remove();

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced for-of loop at line ${lineNum} with array pipeline`,
    };
  },
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      for (const loop of sf.getDescendantsOfKind(SyntaxKind.ForOfStatement)) {
        candidates.push({ file, target: String(loop.getStartLineNumber()) });
      }
    }
    return candidates;
  },
});
