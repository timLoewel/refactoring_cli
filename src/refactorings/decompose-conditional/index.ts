import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

export const decomposeConditional = defineRefactoring<SourceFileContext>({
  name: "Decompose Conditional",
  kebabName: "decompose-conditional",
  tier: 2,
  description:
    "Extracts the condition and each branch of an if statement into separate named functions for clarity.",
  params: [
    param.file(),
    param.string("target", "Line number of the if statement to decompose (1-based)"),
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

    const ifStmt = sf
      .getDescendantsOfKind(SyntaxKind.IfStatement)
      .find((s) => s.getStartLineNumber() === lineNum);

    if (!ifStmt) {
      errors.push(`No if statement found at line ${lineNum} in file`);
      return { ok: false, errors };
    }

    const condition = ifStmt.getExpression().getText();
    if (condition.trim() === "") {
      errors.push(`If statement at line ${lineNum} has an empty condition`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const lineNum = Number(params["target"] as string);

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
      filesChanged: [file],
      description: `Decomposed conditional at line ${lineNum} into named functions`,
    };
  },
});
