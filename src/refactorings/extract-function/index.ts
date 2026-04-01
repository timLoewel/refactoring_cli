import { Node, SyntaxKind } from "ts-morph";
import type {
  Identifier,
  ParameterDeclaration,
  SourceFile,
  Statement,
  VariableDeclaration,
} from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

interface StatementsContainer {
  getStatements(): Statement[];
  insertStatements(index: number, text: string): void;
  getStart(): number;
  getEnd(): number;
}

/**
 * Find the innermost block (or source file) whose direct-child statements
 * all fall within [startLine, endLine], and return those statements.
 */
function findTargetStatements(
  sf: SourceFile,
  startLine: number,
  endLine: number,
): { stmts: Statement[]; container: StatementsContainer } | null {
  const inRange = (s: Statement): boolean =>
    s.getStartLineNumber() >= startLine && s.getEndLineNumber() <= endLine;

  type Candidate = { stmts: Statement[]; container: StatementsContainer; span: number };
  const candidates: Candidate[] = [];

  const sfStmts = sf.getStatements().filter(inRange);
  if (sfStmts.length > 0) {
    candidates.push({ stmts: sfStmts, container: sf, span: sf.getEnd() - sf.getStart() });
  }

  for (const block of sf.getDescendantsOfKind(SyntaxKind.Block)) {
    const blockStmts = block.getStatements().filter(inRange);
    if (blockStmts.length > 0) {
      candidates.push({
        stmts: blockStmts,
        container: block,
        span: block.getEnd() - block.getStart(),
      });
    }
  }

  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => a.span - b.span);
  return sorted[0] ?? null;
}

/** True if the identifier is used as a value, not as a property/declaration name. */
function isValueReference(id: Identifier): boolean {
  const parent = id.getParent();
  if (!parent) return false;
  if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) return false;
  if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
  if (Node.isBindingElement(parent) && parent.getNameNode() === id) return false;
  if (Node.isFunctionDeclaration(parent) && parent.getNameNode() === id) return false;
  if (Node.isMethodDeclaration(parent) && parent.getNameNode() === id) return false;
  return true;
}

/** Get a type string for a parameter, widening literal types to their base. */
function getParamType(decl: VariableDeclaration | ParameterDeclaration): string {
  const typeNode = decl.getTypeNode();
  if (typeNode) return typeNode.getText();
  const t = decl.getType();
  if (t.isStringLiteral()) return "string";
  if (t.isNumberLiteral()) return "number";
  if (t.isBooleanLiteral()) return "boolean";
  const text = t.getText();
  if (text.includes("import(") || text.startsWith("typeof ")) return "unknown";
  return text;
}

/**
 * Find identifiers in the extraction range that refer to declarations OUTSIDE
 * the range (declared in this source file). These become function parameters.
 */
function findOuterScopeParams(
  stmts: Statement[],
  sf: SourceFile,
  startLine: number,
  endLine: number,
): Array<{ name: string; type: string }> {
  const result = new Map<string, string>();

  for (const stmt of stmts) {
    for (const id of stmt.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (!isValueReference(id)) continue;

      const sym = id.getSymbol();
      if (!sym) continue;

      const decls = sym.getDeclarations();
      if (!decls || decls.length === 0) continue;

      // Only consider declarations within this source file (not globals/builtins)
      const sfDecls = decls.filter((d) => d.getSourceFile() === sf);
      if (sfDecls.length === 0) continue;

      // Skip if any declaration is inside the extraction range
      const anyInsideRange = sfDecls.some((d) => {
        const line = d.getStartLineNumber();
        return line >= startLine && line <= endLine;
      });
      if (anyInsideRange) continue;

      const varName = id.getText();
      if (result.has(varName)) continue;

      const firstDecl = sfDecls[0];
      if (!firstDecl) continue;

      let typeStr = "unknown";
      if (Node.isVariableDeclaration(firstDecl)) {
        typeStr = getParamType(firstDecl);
      } else if (Node.isParameter(firstDecl)) {
        typeStr = getParamType(firstDecl);
      } else {
        const typeNode = firstDecl.getType();
        typeStr = typeNode.getText();
      }

      result.set(varName, typeStr);
    }
  }

  return Array.from(result.entries()).map(([name, type]) => ({ name, type }));
}

/**
 * Find variables declared in the extraction range that are referenced AFTER it.
 * These must be returned from the extracted function.
 */
function findEscapingDeclarations(
  stmts: Statement[],
  sf: SourceFile,
  endLine: number,
): string[] {
  const escaping: string[] = [];

  for (const stmt of stmts) {
    for (const decl of stmt.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const varName = decl.getName();
      const usedAfter = sf.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => {
        if (id.getText() !== varName) return false;
        if (id.getStartLineNumber() <= endLine) return false;
        const parent = id.getParent();
        if (!parent) return false;
        if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
        return true;
      });
      if (usedAfter && !escaping.includes(varName)) {
        escaping.push(varName);
      }
    }
  }

  return escaping;
}

export const extractFunction = defineRefactoring<SourceFileContext>({
  name: "Extract Function",
  kebabName: "extract-function",
  tier: 2,
  description:
    "Extracts a range of lines into a new named function and replaces them with a call to it.",
  params: [
    param.file(),
    param.number("startLine", "First line of code to extract (1-based)"),
    param.number("endLine", "Last line of code to extract (1-based)"),
    param.identifier("name", "Name for the extracted function"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const startLine = params["startLine"] as number;
    const endLine = params["endLine"] as number;
    const name = params["name"] as string;

    if (endLine < startLine) {
      errors.push("param 'endLine' must be >= 'startLine'");
    }

    const totalLines = sf.getEndLineNumber();
    if (startLine > totalLines) {
      errors.push(`startLine ${startLine} exceeds file length ${totalLines}`);
    }
    if (endLine > totalLines) {
      errors.push(`endLine ${endLine} exceeds file length ${totalLines}`);
    }

    const existing = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === name);
    if (existing) {
      errors.push(`A function named '${name}' already exists in the file`);
    }

    // Check for bare break/continue in extraction range (cannot be moved to another function)
    const found = findTargetStatements(sf, startLine, endLine);
    if (found) {
      for (const stmt of found.stmts) {
        const hasBreak = stmt.getDescendantsOfKind(SyntaxKind.BreakStatement).some((b) => {
          // Only bare break (no label, no enclosing loop within the range)
          return (
            !b.getLabel() &&
            b.getAncestors().every(
              (a) =>
                a === stmt ||
                (!Node.isForStatement(a) &&
                  !Node.isForOfStatement(a) &&
                  !Node.isForInStatement(a) &&
                  !Node.isWhileStatement(a) &&
                  !Node.isDoStatement(a) &&
                  !Node.isSwitchStatement(a)),
            )
          );
        });
        if (hasBreak) {
          errors.push("Cannot extract: selection contains a 'break' that exits an outer loop");
        }

        const hasContinue = stmt.getDescendantsOfKind(SyntaxKind.ContinueStatement).some((c) => {
          return (
            !c.getLabel() &&
            c.getAncestors().every(
              (a) =>
                a === stmt ||
                (!Node.isForStatement(a) &&
                  !Node.isForOfStatement(a) &&
                  !Node.isForInStatement(a) &&
                  !Node.isWhileStatement(a) &&
                  !Node.isDoStatement(a)),
            )
          );
        });
        if (hasContinue) {
          errors.push(
            "Cannot extract: selection contains a 'continue' that exits an outer loop",
          );
        }
      }
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const startLine = params["startLine"] as number;
    const endLine = params["endLine"] as number;
    const name = params["name"] as string;

    const found = findTargetStatements(sf, startLine, endLine);
    if (!found) {
      return {
        success: false,
        filesChanged: [],
        description: `No complete statements found between lines ${startLine} and ${endLine}`,
      };
    }
    const { stmts, container } = found;

    const funcParams = findOuterScopeParams(stmts, sf, startLine, endLine);
    const escapingVars = findEscapingDeclarations(stmts, sf, endLine);

    const isAsync = stmts.some(
      (s) => s.getDescendantsOfKind(SyntaxKind.AwaitExpression).length > 0,
    );

    const paramList = funcParams.map((p) => `${p.name}: ${p.type}`).join(", ");
    const funcArgs = funcParams.map((p) => p.name).join(", ");
    const asyncMod = isAsync ? "async " : "";
    const awaitPre = isAsync ? "await " : "";

    const bodyLines = stmts.map((s) => `  ${s.getText()}`);
    if (escapingVars.length === 1) {
      bodyLines.push(`  return ${escapingVars[0]};`);
    } else if (escapingVars.length > 1) {
      bodyLines.push(`  return { ${escapingVars.join(", ")} };`);
    }

    const functionText = `\n${asyncMod}function ${name}(${paramList}) {\n${bodyLines.join("\n")}\n}\n`;

    let callText: string;
    if (escapingVars.length === 1) {
      callText = `const ${escapingVars[0]} = ${awaitPre}${name}(${funcArgs});`;
    } else if (escapingVars.length > 1) {
      callText = `const { ${escapingVars.join(", ")} } = ${awaitPre}${name}(${funcArgs});`;
    } else {
      callText = `${awaitPre}${name}(${funcArgs});`;
    }

    const containerStmts = container.getStatements();
    const firstStmt = stmts[0];
    if (!firstStmt) {
      return { success: false, filesChanged: [], description: "No statements to extract" };
    }
    const firstIndex = containerStmts.indexOf(firstStmt);
    if (firstIndex === -1) {
      return {
        success: false,
        filesChanged: [],
        description: "Could not locate extracted statements in container",
      };
    }

    // Remove extracted statements in reverse order to preserve positions
    for (const s of [...stmts].reverse()) {
      s.remove();
    }

    // Insert the call at the position of the first removed statement
    container.insertStatements(firstIndex, callText);

    // Append the new function declaration at end of file
    sf.addStatements(functionText);

    return {
      success: true,
      filesChanged: [file],
      description: `Extracted lines ${startLine}-${endLine} into function '${name}'`,
    };
  },
});
