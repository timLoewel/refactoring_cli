import { SyntaxKind } from "ts-morph";
import type { Project, Node } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceLoopWithPipelineParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Line number of the for-of loop to replace (1-based)",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceLoopWithPipelineParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    const lineNum = Number(r["target"]);
    if (!Number.isInteger(lineNum) || lineNum < 1) {
      throw new Error("param 'target' must be a positive integer line number");
    }
    return { file: r["file"] as string, target: r["target"] as string };
  },
};

function preconditions(project: Project, p: ReplaceLoopWithPipelineParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const lineNum = Number(p.target);
  const loop = sf
    .getDescendantsOfKind(SyntaxKind.ForOfStatement)
    .find((l) => l.getStartLineNumber() === lineNum);

  if (!loop) {
    errors.push(`No for-of loop found at line ${lineNum} in file: ${p.file}`);
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
}

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

function apply(project: Project, p: ReplaceLoopWithPipelineParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const lineNum = Number(p.target);
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
    filesChanged: [p.file],
    description: `Replaced for-of loop at line ${lineNum} with array pipeline`,
  };
}

export const replaceLoopWithPipeline: RefactoringDefinition = {
  name: "Replace Loop With Pipeline",
  kebabName: "replace-loop-with-pipeline",
  description:
    "Replaces a for-of loop with an equivalent array pipeline using map, filter, or forEach.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceLoopWithPipelineParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceLoopWithPipelineParams),
};
