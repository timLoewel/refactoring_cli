import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
  SourceFileContext,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";

export const splitLoop = defineRefactoring<SourceFileContext>({
  name: "Split Loop",
  kebabName: "split-loop",
  tier: 2,
  description: "Splits a loop that does two things into two separate loops, each doing one thing.",
  params: [param.file(), param.string("target", "Line number of the for loop to split (1-based)")],
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

    const loops = sf
      .getDescendantsOfKind(SyntaxKind.ForOfStatement)
      .concat(sf.getDescendantsOfKind(SyntaxKind.ForStatement) as never[])
      .concat(sf.getDescendantsOfKind(SyntaxKind.ForInStatement) as never[]);

    const loop = loops.find((l) => l.getStartLineNumber() === lineNum);
    if (!loop) {
      errors.push(`No for loop found at line ${lineNum} in file`);
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
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const lineNum = Number(params["target"] as string);

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
      };
    }

    const body = loop.getChildrenOfKind(SyntaxKind.Block)[0];
    if (!body) {
      return { success: false, filesChanged: [], description: `Loop has no block body` };
    }

    const statements = body.getStatements();
    if (statements.length < 2) {
      return {
        success: false,
        filesChanged: [],
        description: `Loop needs at least 2 statements to split`,
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
      filesChanged: [file],
      description: `Split loop at line ${lineNum} into two separate loops`,
    };
  },
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      for (const loop of sf.getDescendantsOfKind(SyntaxKind.ForStatement)) {
        candidates.push({ file, target: String(loop.getStartLineNumber()) });
      }
      for (const loop of sf.getDescendantsOfKind(SyntaxKind.ForOfStatement)) {
        candidates.push({ file, target: String(loop.getStartLineNumber()) });
      }
      for (const loop of sf.getDescendantsOfKind(SyntaxKind.ForInStatement)) {
        candidates.push({ file, target: String(loop.getStartLineNumber()) });
      }
      for (const loop of sf.getDescendantsOfKind(SyntaxKind.WhileStatement)) {
        candidates.push({ file, target: String(loop.getStartLineNumber()) });
      }
    }
    return candidates;
  },
});
