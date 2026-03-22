import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface DecomposeConditionalParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Line number of the if statement to decompose (1-based)",
      required: true,
    },
  ],
  validate(raw: unknown): DecomposeConditionalParams {
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

function preconditions(project: Project, p: DecomposeConditionalParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const lineNum = Number(p.target);
  const ifStmt = sf
    .getDescendantsOfKind(SyntaxKind.IfStatement)
    .find((s) => s.getStartLineNumber() === lineNum);

  if (!ifStmt) {
    errors.push(`No if statement found at line ${lineNum} in file: ${p.file}`);
    return { ok: false, errors };
  }

  const condition = ifStmt.getExpression().getText();
  if (condition.trim() === "") {
    errors.push(`If statement at line ${lineNum} has an empty condition`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: DecomposeConditionalParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const lineNum = Number(p.target);
  const ifStmt = sf
    .getDescendantsOfKind(SyntaxKind.IfStatement)
    .find((s) => s.getStartLineNumber() === lineNum);

  if (!ifStmt) {
    return {
      success: false,
      filesChanged: [],
      description: `No if statement found at line ${lineNum}`,
    };
  }

  const conditionText = ifStmt.getExpression().getText();
  const thenStmt = ifStmt.getThenStatement();
  const elseStmt = ifStmt.getElseStatement();

  // Generate unique function names
  const condFnName = "isConditionMet";
  const thenFnName = "thenBranch";
  const elseFnName = "elseBranch";

  // Extract then body
  let thenBody: string;
  if (thenStmt.getKind() === SyntaxKind.Block) {
    const stmts = thenStmt.getChildSyntaxList()?.getChildren() ?? [];
    thenBody = stmts.map((s) => `  ${s.getText()}`).join("\n");
  } else {
    thenBody = `  ${thenStmt.getText()}`;
  }

  // Build replacement
  const condFn = `function ${condFnName}(): boolean {\n  return ${conditionText};\n}`;
  const thenFn = `function ${thenFnName}(): void {\n${thenBody}\n}`;

  let replacementIf: string;
  let elseFn = "";

  if (elseStmt) {
    let elseBody: string;
    if (elseStmt.getKind() === SyntaxKind.Block) {
      const stmts = elseStmt.getChildSyntaxList()?.getChildren() ?? [];
      elseBody = stmts.map((s) => `  ${s.getText()}`).join("\n");
    } else {
      elseBody = `  ${elseStmt.getText()}`;
    }
    elseFn = `\nfunction ${elseFnName}(): void {\n${elseBody}\n}`;
    replacementIf = `if (${condFnName}()) {\n  ${thenFnName}();\n} else {\n  ${elseFnName}();\n}`;
  } else {
    replacementIf = `if (${condFnName}()) {\n  ${thenFnName}();\n}`;
  }

  ifStmt.replaceWithText(replacementIf);

  // Append helper functions to the end of the file
  sf.addStatements(`\n${condFn}\n${thenFn}${elseFn}`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Decomposed conditional at line ${lineNum} into named functions`,
  };
}

export const decomposeConditional: RefactoringDefinition = {
  name: "Decompose Conditional",
  kebabName: "decompose-conditional",
  description:
    "Extracts the condition and each branch of an if statement into separate named functions for clarity.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as DecomposeConditionalParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as DecomposeConditionalParams),
};
