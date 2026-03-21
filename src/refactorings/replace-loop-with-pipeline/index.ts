import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
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

function apply(project: Project, p: ReplaceLoopWithPipelineParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
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
      diff: [],
    };
  }

  const body = loop.getChildrenOfKind(SyntaxKind.Block)[0];
  if (!body) {
    return { success: false, filesChanged: [], description: `Loop has no block body`, diff: [] };
  }

  // Extract the iterable expression
  const expression = loop.getExpression().getText();

  // Extract the loop variable
  const initializer = loop.getInitializer().getText();
  // Strip "const " / "let " prefix if present
  const varName = initializer.replace(/^(const|let|var)\s+/, "");

  const statements = body.getStatements();

  // Detect push patterns: resultArray.push(expr) => map + forEach
  const pushStatements = statements.filter((s) => {
    const text = s.getText();
    return /\w+\.push\(/.test(text);
  });

  const otherStatements = statements.filter((s) => {
    const text = s.getText();
    return !/\w+\.push\(/.test(text);
  });

  let replacement: string;

  if (pushStatements.length === statements.length && pushStatements.length === 1) {
    // Single push: replace with map or forEach
    const firstPushStmt = pushStatements[0];
    const pushText = firstPushStmt ? firstPushStmt.getText().trim() : "";
    const pushMatch = pushText.match(/^(\w+)\.push\((.+)\);?$/s);
    if (pushMatch) {
      const arrayName = pushMatch[1];
      const mappedExpr = pushMatch[2];
      if (mappedExpr !== undefined && mappedExpr.trim() === varName) {
        replacement = `const ${arrayName} = [...${expression}];`;
      } else if (mappedExpr !== undefined) {
        replacement = `const ${arrayName} = ${expression}.map((${varName}) => ${mappedExpr});`;
      } else {
        replacement = `${expression}.forEach((${varName}) => {\n  ${statements.map((s) => s.getText()).join("\n  ")}\n});`;
      }
    } else {
      replacement = `${expression}.forEach((${varName}) => {\n  ${statements.map((s) => s.getText()).join("\n  ")}\n});`;
    }
  } else if (otherStatements.length === 0 && pushStatements.length > 1) {
    // Multiple pushes: use forEach
    const body2 = statements.map((s) => `  ${s.getText()}`).join("\n");
    replacement = `${expression}.forEach((${varName}) => {\n${body2}\n});`;
  } else {
    // General case: use forEach
    const bodyLines = statements.map((s) => `  ${s.getText()}`).join("\n");
    replacement = `${expression}.forEach((${varName}) => {\n${bodyLines}\n});`;
  }

  loop.replaceWithText(replacement);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced for-of loop at line ${lineNum} with array pipeline`,
    diff: [],
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
