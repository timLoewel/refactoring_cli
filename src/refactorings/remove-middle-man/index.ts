import { Node, type MethodDeclaration } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

function isDelegatingMethod(method: MethodDeclaration, delegateName: string): boolean {
  const body = method.getBody();
  if (!body) {
    return false;
  }
  const bodyText = body.getText();
  return bodyText.includes(`this.${delegateName}.`);
}

export const removeMiddleMan = defineRefactoring<ClassContext>({
  name: "Remove Middle Man",
  kebabName: "remove-middle-man",
  tier: 3,
  description:
    "Removes methods that merely forward calls to a delegate field, exposing the delegate directly.",
  params: [
    param.file(),
    param.identifier("target", "Name of the class acting as middle man"),
    param.identifier("delegate", "Name of the delegate field whose methods are being forwarded"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(ctx: ClassContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const delegate = params["delegate"] as string;
    const { cls } = ctx;

    const delegateProp = cls.getProperty(delegate);
    if (!delegateProp) {
      errors.push(
        `Delegate field '${delegate}' not found on class '${params["target"] as string}'`,
      );
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const delegate = params["delegate"] as string;
    const { cls: targetClass, sourceFile } = ctx;

    const delegatingMethods = targetClass
      .getMethods()
      .filter((method) => isDelegatingMethod(method, delegate));

    const removedNames = delegatingMethods.map((method) => method.getName());

    // Rewrite call sites: person.getManager() -> person.department.getManager()
    // Collect all replacement positions first, then apply in reverse order.
    const project = sourceFile.getProject();
    const replacements: { pos: number; end: number; newText: string; filePath: string }[] = [];

    for (const method of delegatingMethods) {
      const methodName = method.getName();
      const nameNode = method.getNameNode();
      const refs = nameNode.findReferencesAsNodes();

      for (const ref of refs) {
        // Skip the definition itself
        if (ref === nameNode || ref.getStart() === nameNode.getStart()) continue;

        const parent = ref.getParent();
        if (!parent || !Node.isPropertyAccessExpression(parent)) continue;

        // The property access is `obj.methodName` — rewrite to `obj.delegate.methodName`
        const objectExpr = parent.getExpression();
        const newExprText = `${objectExpr.getText()}.${delegate}.${methodName}`;
        replacements.push({
          pos: parent.getStart(),
          end: parent.getEnd(),
          newText: newExprText,
          filePath: ref.getSourceFile().getFilePath(),
        });
      }
    }

    // Group replacements by file and apply in reverse order to maintain positions
    const byFile = new Map<string, typeof replacements>();
    for (const r of replacements) {
      const existing = byFile.get(r.filePath) ?? [];
      existing.push(r);
      byFile.set(r.filePath, existing);
    }

    for (const [filePath, fileReplacements] of byFile) {
      const sf = project.getSourceFile(filePath);
      if (!sf) continue;
      // Sort by position descending so later replacements don't shift earlier positions
      fileReplacements.sort((a, b) => b.pos - a.pos);
      let text = sf.getFullText();
      for (const r of fileReplacements) {
        text = text.slice(0, r.pos) + r.newText + text.slice(r.end);
      }
      sf.replaceWithText(text);
    }

    // Re-resolve the class after text replacements (original nodes are stale)
    const freshClass = sourceFile.getClass(target);
    if (freshClass) {
      const freshDelegating = freshClass
        .getMethods()
        .filter((method) => isDelegatingMethod(method, delegate));
      const reversedMethods = [...freshDelegating].reverse();
      for (const method of reversedMethods) {
        method.remove();
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Removed ${removedNames.length} delegating method(s) [${removedNames.join(", ")}] from '${target}', exposing delegate '${delegate}' directly`,
    };
  },
  enumerate: enumerate.classes,
});
