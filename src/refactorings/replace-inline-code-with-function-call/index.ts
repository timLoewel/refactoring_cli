import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

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

    // Find all expression nodes whose text matches the target and are in expression position
    const allNodes = sf.getDescendants();
    const matches = allNodes.filter(
      (node) => node.getText() === target && isExpressionPosition(node),
    );
    const sorted = [...matches].sort((a, b) => b.getStart() - a.getStart());

    let replacements = 0;
    for (const node of sorted) {
      try {
        node.replaceWithText(`${name}()`);
        replacements++;
      } catch {
        // Skip nodes that can't be replaced (e.g. in positions where a function call is invalid)
      }
    }

    if (replacements === 0) {
      // Fall back to raw text replacement
      const fullText = sf.getFullText();
      const newText = fullText.split(target).join(`${name}()`);
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
