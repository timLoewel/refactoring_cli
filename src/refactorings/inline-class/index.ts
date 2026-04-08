import { Node, SyntaxKind } from "ts-morph";
import type { ClassDeclaration, SourceFile } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

function copyMembersIntoClass(memberTexts: string[], intoClass: ClassDeclaration): void {
  for (const memberText of memberTexts) {
    intoClass.addMember(memberText);
  }
}

/**
 * Rewrites `new TargetClass()` usages: redirects property accesses from
 * target-class variables to the nearest into-class variable, then removes
 * the target-class variable declarations.
 */
function rewriteNewExpressions(sf: SourceFile, target: string, into: string): void {
  // Collect variable names whose initializer is `new TargetClass()`
  // and find the first variable whose initializer is `new IntoClass()`
  const targetVarNames: string[] = [];
  let intoVarName: string | undefined;

  for (const varDecl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = varDecl.getInitializer();
    if (!init || !Node.isNewExpression(init)) continue;
    const expr = init.getExpression();
    const className = expr.getText();
    if (className === target) {
      targetVarNames.push(varDecl.getName());
    } else if (className === into && intoVarName === undefined) {
      intoVarName = varDecl.getName();
    }
  }

  if (targetVarNames.length === 0 || intoVarName === undefined) return;

  // Replace property accesses: `targetVar.prop` -> `intoVar.prop`
  for (const targetVarName of targetVarNames) {
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (id.getText() !== targetVarName) continue;
      const parent = id.getParent();
      if (!parent || !Node.isPropertyAccessExpression(parent)) continue;
      if (parent.getExpression() !== id) continue;
      id.replaceWithText(intoVarName);
    }
  }

  // Remove variable statements that declare `new TargetClass()`
  for (const varStmt of [...sf.getDescendantsOfKind(SyntaxKind.VariableStatement)]) {
    const decls = varStmt.getDeclarationList().getDeclarations();
    const allTarget = decls.every((d) => {
      const init = d.getInitializer();
      return init && Node.isNewExpression(init) && init.getExpression().getText() === target;
    });
    if (allTarget) {
      varStmt.remove();
    }
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

    // Redirect `new TargetClass()` usages to the receiving class variable
    rewriteNewExpressions(sf, target, into);

    return {
      success: true,
      filesChanged: [file],
      description: `Inlined class '${target}' into '${into}' (${memberTexts.length} member(s) moved)`,
    };
  },
  enumerate: enumerate.classes,
});
