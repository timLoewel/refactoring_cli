import { SyntaxKind } from "ts-morph";
import type { Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

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

function buildPipelineReplacement(expression: string, varName: string, statements: Node[]): string {
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

    loop.replaceWithText(replacement);

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced for-of loop at line ${lineNum} with array pipeline`,
    };
  },
});
