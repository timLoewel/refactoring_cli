import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

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

    // Find all expression nodes whose text matches the target
    const allNodes = sf.getDescendants();
    const matches = allNodes.filter((node) => node.getText() === target);
    const sorted = [...matches].sort((a, b) => b.getStart() - a.getStart());

    let replacements = 0;
    for (const node of sorted) {
      node.replaceWithText(`${name}()`);
      replacements++;
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
