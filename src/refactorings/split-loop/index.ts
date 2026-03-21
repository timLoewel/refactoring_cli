import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface SplitLoopParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Line number of the for loop to split (1-based)",
      required: true,
    },
  ],
  validate(raw: unknown): SplitLoopParams {
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

function preconditions(project: Project, p: SplitLoopParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const lineNum = Number(p.target);
  const loops = sf
    .getDescendantsOfKind(SyntaxKind.ForOfStatement)
    .concat(sf.getDescendantsOfKind(SyntaxKind.ForStatement) as never[])
    .concat(sf.getDescendantsOfKind(SyntaxKind.ForInStatement) as never[]);

  const loop = loops.find((l) => l.getStartLineNumber() === lineNum);
  if (!loop) {
    errors.push(`No for loop found at line ${lineNum} in file: ${p.file}`);
    return { ok: false, errors };
  }

  const body = loop.getChildrenOfKind(SyntaxKind.Block)[0];
  if (!body) {
    errors.push(`Loop at line ${lineNum} has no block body`);
    return { ok: false, errors };
  }

  const statements = body.getStatements();
  if (statements.length < 2) {
    errors.push(`Loop at line ${lineNum} must have at least 2 statements to split`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: SplitLoopParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const lineNum = Number(p.target);

  const forOfLoops = sf.getDescendantsOfKind(SyntaxKind.ForOfStatement);
  const forLoops = sf.getDescendantsOfKind(SyntaxKind.ForStatement);
  const forInLoops = sf.getDescendantsOfKind(SyntaxKind.ForInStatement);
  const allLoops = [...forOfLoops, ...forLoops, ...forInLoops];

  const loop = allLoops.find((l) => l.getStartLineNumber() === lineNum);
  if (!loop) {
    return {
      success: false,
      filesChanged: [],
      description: `No for loop found at line ${lineNum}`,
      diff: [],
    };
  }

  const body = loop.getChildrenOfKind(SyntaxKind.Block)[0];
  if (!body) {
    return { success: false, filesChanged: [], description: `Loop has no block body`, diff: [] };
  }

  const statements = body.getStatements();
  if (statements.length < 2) {
    return {
      success: false,
      filesChanged: [],
      description: `Loop needs at least 2 statements to split`,
      diff: [],
    };
  }

  // Split statements into two halves
  const mid = Math.ceil(statements.length / 2);
  const firstHalf = statements.slice(0, mid);
  const secondHalf = statements.slice(mid);

  const firstBody = firstHalf.map((s) => `  ${s.getText()}`).join("\n");
  const secondBody = secondHalf.map((s) => `  ${s.getText()}`).join("\n");

  // Build loop header text by getting the text before the body block
  const loopText = loop.getText();
  const bodyText = body.getText();
  const headerText = loopText.slice(0, loopText.lastIndexOf(bodyText)).trim();

  const firstLoop = `${headerText} {\n${firstBody}\n}`;
  const secondLoop = `${headerText} {\n${secondBody}\n}`;

  loop.replaceWithText(`${firstLoop}\n${secondLoop}`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Split loop at line ${lineNum} into two separate loops`,
    diff: [],
  };
}

export const splitLoop: RefactoringDefinition = {
  name: "Split Loop",
  kebabName: "split-loop",
  description: "Splits a loop that does two things into two separate loops, each doing one thing.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as SplitLoopParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as SplitLoopParams),
};
