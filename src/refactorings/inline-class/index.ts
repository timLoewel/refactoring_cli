import { SyntaxKind } from "ts-morph";
import type { ClassDeclaration } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

function copyMembersIntoClass(memberTexts: string[], intoClass: ClassDeclaration): void {
  for (const memberText of memberTexts) {
    intoClass.addMember(memberText);
  }
}

export const inlineClass = defineRefactoring<SourceFileContext>({
  name: "Inline Class",
  kebabName: "inline-class",
  tier: 3,
  description: "Moves all members of one class into another class and removes the emptied class.",
  params: [
    param.file(),
    param.identifier("target", "Name of the class to inline"),
    param.identifier("into", "Name of the class to receive the inlined members"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const into = params["into"] as string;

    const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
    const targetClass = classes.find((c) => c.getName() === target);
    if (!targetClass) {
      errors.push(`Class '${target}' not found in file: ${params["file"] as string}`);
    }

    const intoClass = classes.find((c) => c.getName() === into);
    if (!intoClass) {
      errors.push(`Class '${into}' not found in file: ${params["file"] as string}`);
    }

    if (target === into) {
      errors.push("'target' and 'into' must be different classes");
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const into = params["into"] as string;

    const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
    const targetClass = classes.find((c) => c.getName() === target);
    const intoClass = classes.find((c) => c.getName() === into);

    if (!targetClass || !intoClass) {
      return {
        success: false,
        filesChanged: [],
        description: `One or both classes not found`,
      };
    }

    const members = targetClass.getMembers();
    const memberTexts = members.map((m) => m.getText());

    copyMembersIntoClass(memberTexts, intoClass);
    targetClass.remove();

    return {
      success: true,
      filesChanged: [file],
      description: `Inlined class '${target}' into '${into}' (${memberTexts.length} member(s) moved)`,
    };
  },
});
