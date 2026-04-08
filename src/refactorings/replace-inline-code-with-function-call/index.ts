import { Node, SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

/**
 * Build the call expression text for replacing inline code.
 * If the function `name` is declared in the file and has parameters, extract
 * the free identifiers from `inlineExpr` that are not declared inside the
 * function, and map them positionally to the function's parameters.
 */
function buildCallExpression(sf: SourceFile, name: string, inlineExpr: string): string {
  const fnDecl = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === name);
  if (!fnDecl) return `${name}()`;

  const fnParams = fnDecl.getParameters();
  if (fnParams.length === 0) return `${name}()`;

  // Parse the inline expression to find its free identifiers
  const body = fnDecl.getBody();
  if (!body) return `${name}()`;

  const paramNames = fnParams.map((p) => p.getName());

  // For each function parameter, find what identifier in the inline expression
  // corresponds to it. We do this by replacing each parameter name in the body
  // expression with a placeholder and matching against the inline expression.
  // Simpler approach: find identifiers in the inline expression that are not
  // the function's parameter names but correspond to the same structural position.
  //
  // Extract the core expression from the function body (e.g., "age >= 18" from
  // "{ return age >= 18; }"). Then align identifiers between body expr and inline expr.
  const returnStmts = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
  if (returnStmts.length === 0) return `${name}()`;

  const returnExpr = returnStmts[0].getExpression();
  if (!returnExpr) return `${name}()`;

  const bodyExprText = returnExpr.getText();

  // Build a mapping: for each param, find what it maps to in the inline expression
  // by replacing param names in the body expression pattern and matching.
  const args: string[] = [];
  const currentInline = inlineExpr;
  const currentBody = bodyExprText;

  for (const pName of paramNames) {
    // Find where pName appears in the body expression
    const paramRegex = new RegExp(`\\b${pName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    const bodyMatch = paramRegex.exec(currentBody);
    if (!bodyMatch) {
      args.push(pName);
      continue;
    }

    // The corresponding text in the inline expression is at the same position
    // Build a pattern from the body expression with param replaced by a capture group
    const escapedBody = currentBody.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedParam = pName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const capturePattern = escapedBody.replace(
      new RegExp(`\\\\b${escapedParam}\\\\b|${escapedParam}`),
      "([a-zA-Z_$][a-zA-Z0-9_$]*)",
    );

    try {
      const matchRegex = new RegExp(`^${capturePattern}$`);
      const inlineMatch = matchRegex.exec(currentInline);
      if (inlineMatch && inlineMatch[1]) {
        args.push(inlineMatch[1]);
      } else {
        args.push(pName);
      }
    } catch {
      args.push(pName);
    }
  }

  return `${name}(${args.join(", ")})`;
}

/** Check if a node is in an expression position (safe to replace with a function call). */
function isExpressionPosition(node: Node): boolean {
  const parent = node.getParent();
  if (!parent) return false;
  // Reject: class/interface members, property declarations, type nodes
  if (Node.isPropertyDeclaration(node)) return false;
  if (Node.isPropertyDeclaration(parent)) return false;
  if (Node.isPropertySignature(node) || Node.isPropertySignature(parent)) return false;
  if (Node.isClassDeclaration(parent) || Node.isInterfaceDeclaration(parent)) return false;
  if (Node.isTypeNode(node) || Node.isTypeNode(parent)) return false;
  if (Node.isDecorator(parent)) return false;
  if (Node.isImportDeclaration(parent) || Node.isImportSpecifier(parent)) return false;
  return true;
}

export const replaceInlineCodeWithFunctionCall = defineRefactoring<SourceFileContext>({
  name: "Replace Inline Code With Function Call",
  kebabName: "replace-inline-code-with-function-call",
  tier: 2,
  description: "Replaces occurrences of an inline expression with a call to a named function.",
  params: [
    param.file(),
    param.string("target", "Inline code expression to replace"),
    param.identifier("name", "Name of the function to call instead"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const target = params["target"] as string;
    const text = ctx.sourceFile.getFullText();
    if (!text.includes(target)) {
      errors.push(`Inline code '${target}' not found in file`);
    }
    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const name = params["name"] as string;

    // Look up the target function to determine its parameters
    const callText = buildCallExpression(sf, name, target);

    // Find all expression nodes whose text matches the target and are in expression position
    const allNodes = sf.getDescendants();
    const matches = allNodes.filter(
      (node) => node.getText() === target && isExpressionPosition(node),
    );
    const sorted = [...matches].sort((a, b) => b.getStart() - a.getStart());

    let replacements = 0;
    for (const node of sorted) {
      try {
        node.replaceWithText(callText);
        replacements++;
      } catch {
        // Skip nodes that can't be replaced (e.g. in positions where a function call is invalid)
      }
    }

    if (replacements === 0) {
      // Fall back to raw text replacement
      const fullText = sf.getFullText();
      const newText = fullText.split(target).join(callText);
      sf.replaceWithText(newText);
      replacements = (
        fullText.match(new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []
      ).length;
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced ${replacements} occurrence(s) of inline code with call to '${name}()'`,
    };
  },
});
