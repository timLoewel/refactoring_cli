import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
  SourceFileContext,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import { cleanupUnused } from "../../core/cleanup-unused.js";

/** Collect free variables in a node that are declared in an enclosing function scope. */
function findClosureVars(node: Node, sf: Node): { name: string; type: string }[] {
  const result = new Map<string, string>();
  const nodeStart = node.getStart();
  const nodeEnd = node.getEnd();

  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    // Skip property names, declaration names
    const parent = id.getParent();
    if (!parent) continue;
    if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) continue;
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) continue;
    if (Node.isParameterDeclaration(parent) && parent.getNameNode() === id) continue;

    const sym = id.getSymbol();
    if (!sym) continue;
    const decls = sym.getDeclarations();
    if (!decls || decls.length === 0) continue;

    const decl = decls.find((d) => d.getSourceFile() === sf.getSourceFile());
    if (!decl) continue;

    const declPos = decl.getStart();
    // Skip if declared inside the node itself
    if (declPos >= nodeStart && declPos <= nodeEnd) continue;

    // Only include if declared inside a function (not top-level)
    const insideFunction = decl
      .getAncestors()
      .some(
        (a) =>
          Node.isFunctionDeclaration(a) ||
          Node.isArrowFunction(a) ||
          Node.isFunctionExpression(a) ||
          Node.isMethodDeclaration(a),
      );
    if (!insideFunction) continue;

    const varName = id.getText();
    if (result.has(varName)) continue;

    let typeStr = "unknown";
    if (Node.isVariableDeclaration(decl)) {
      const typeNode = decl.getTypeNode();
      typeStr = typeNode ? typeNode.getText() : decl.getType().getText(decl);
    } else if (Node.isParameterDeclaration(decl)) {
      const typeNode = decl.getTypeNode();
      typeStr = typeNode ? typeNode.getText() : decl.getType().getText(decl);
    }
    // Fall back to unknown only if the type is truly unresolvable
    if (typeStr.includes("import(") || typeStr === "" || typeStr.startsWith("typeof ")) {
      typeStr = "unknown";
    }

    result.set(varName, typeStr);
  }

  return Array.from(result.entries()).map(([name, type]) => ({ name, type }));
}

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

    // Branches with return/throw/break/continue can't be extracted into separate functions
    // because the control flow semantics change
    const thenStmt = ifStmt.getThenStatement();
    const elseStmt = ifStmt.getElseStatement();
    const hasControlFlow = (node: Node): boolean =>
      node.getDescendantsOfKind(SyntaxKind.ReturnStatement).length > 0 ||
      node.getDescendantsOfKind(SyntaxKind.ThrowStatement).length > 0 ||
      node.getDescendantsOfKind(SyntaxKind.BreakStatement).length > 0 ||
      node.getDescendantsOfKind(SyntaxKind.ContinueStatement).length > 0;

    if (hasControlFlow(thenStmt) || (elseStmt && hasControlFlow(elseStmt))) {
      errors.push(
        `If statement at line ${lineNum} contains return/throw/break in a branch — cannot safely extract into functions`,
      );
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

    // Collect closure variables from the condition and branches
    const condVars = findClosureVars(ifStmt.getExpression(), sf);
    const thenVars = findClosureVars(thenStmt, sf);
    const elseVars = elseStmt ? findClosureVars(elseStmt, sf) : [];

    // Merge all unique closure vars
    const allVarsMap = new Map<string, string>();
    for (const v of [...condVars, ...thenVars, ...elseVars]) {
      if (!allVarsMap.has(v.name)) allVarsMap.set(v.name, v.type);
    }
    const closureParams = Array.from(allVarsMap.entries());
    const paramList = closureParams.map(([n, t]) => `${n}: ${t}`).join(", ");
    const argList = closureParams.map(([n]) => n).join(", ");

    // Extract then body
    let thenBody: string;
    if (thenStmt.getKind() === SyntaxKind.Block) {
      const stmts = thenStmt.getChildSyntaxList()?.getChildren() ?? [];
      thenBody = stmts.map((s) => `  ${s.getText()}`).join("\n");
    } else {
      thenBody = `  ${thenStmt.getText()}`;
    }

    // Build replacement
    const condFn = `function ${condFnName}(${paramList}): boolean {\n  return ${conditionText};\n}`;
    const thenFn = `function ${thenFnName}(${paramList}): void {\n${thenBody}\n}`;

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
      elseFn = `\nfunction ${elseFnName}(${paramList}): void {\n${elseBody}\n}`;
      replacementIf = `if (${condFnName}(${argList})) {\n  ${thenFnName}(${argList});\n} else {\n  ${elseFnName}(${argList});\n}`;
    } else {
      replacementIf = `if (${condFnName}(${argList})) {\n  ${thenFnName}(${argList});\n}`;
    }

    ifStmt.replaceWithText(replacementIf);

    // Append helper functions to the end of the file
    sf.addStatements(`\n${condFn}\n${thenFn}${elseFn}`);

    cleanupUnused(sf);

    return {
      success: true,
      filesChanged: [file],
      description: `Decomposed conditional at line ${lineNum} into named functions`,
    };
  },
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      for (const ifStmt of sf.getDescendantsOfKind(SyntaxKind.IfStatement)) {
        candidates.push({ file, target: String(ifStmt.getStartLineNumber()) });
      }
    }
    return candidates;
  },
});
