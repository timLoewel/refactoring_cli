import type { ClassDeclaration, ConstructorDeclaration, Project } from "ts-morph";
import { Node } from "ts-morph";
import type { RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

interface PullUpContext extends ClassContext {
  subConstructor: ConstructorDeclaration;
  parentClass: ClassDeclaration;
}

function resolvePullUpContext(
  project: Project,
  params: Record<string, unknown>,
): { ok: true; value: PullUpContext } | { ok: false; result: RefactoringResult } {
  const classResult = resolve.class(project, params);
  if (!classResult.ok) return classResult;

  const { sourceFile, cls } = classResult.value;
  const target = params["target"] as string;

  const subConstructor = cls.getConstructors()[0];
  if (!subConstructor) {
    return {
      ok: false,
      result: {
        success: false,
        filesChanged: [],
        description: `Class '${target}' has no constructor`,
      },
    };
  }

  const extendsClause = cls.getExtends();
  if (!extendsClause) {
    return {
      ok: false,
      result: {
        success: false,
        filesChanged: [],
        description: `Class '${target}' does not extend any class`,
      },
    };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sourceFile.getClass(parentName);
  if (!parentClass) {
    return {
      ok: false,
      result: {
        success: false,
        filesChanged: [],
        description: `Parent class '${parentName}' not found in file`,
      },
    };
  }

  return { ok: true, value: { sourceFile, cls, subConstructor, parentClass } };
}

function addStatementsToParent(
  parentClass: ClassDeclaration,
  subConstructor: ConstructorDeclaration,
  nonSuperStatements: string[],
): void {
  const existingParentConstructor = parentClass.getConstructors()[0];
  if (existingParentConstructor) {
    for (const statement of nonSuperStatements) {
      existingParentConstructor.addStatements(statement);
    }
  } else {
    const subParams = subConstructor
      .getParameters()
      .map((p) => p.getText())
      .join(", ");
    parentClass.addConstructor({
      parameters: subParams ? [{ name: subParams }] : [],
      statements: nonSuperStatements,
    });
  }
}

function removeNonSuperStatements(constructor: ConstructorDeclaration): void {
  const body = constructor.getBody();
  if (!body || !Node.isBlock(body)) return;
  const stmtsToRemove = body.getStatements().filter((s) => !s.getText().startsWith("super("));
  for (const stmt of [...stmtsToRemove].reverse()) {
    stmt.remove();
  }
}

function getNonSuperStatements(constructor: ConstructorDeclaration): string[] {
  const body = constructor.getBody();
  if (!body || !Node.isBlock(body)) return [];
  return body
    .getStatements()
    .map((s) => s.getText())
    .filter((text) => !text.startsWith("super("));
}

export const pullUpConstructorBody = defineRefactoring<PullUpContext>({
  name: "Pull Up Constructor Body",
  kebabName: "pull-up-constructor-body",
  description:
    "Moves common constructor initialization logic from a subclass up to the superclass constructor.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the subclass whose constructor body to pull up"),
  ],
  resolve: resolvePullUpContext,
  apply(ctx, params): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { subConstructor, parentClass } = ctx;

    const nonSuperStatements = getNonSuperStatements(subConstructor);
    addStatementsToParent(parentClass, subConstructor, nonSuperStatements);
    removeNonSuperStatements(subConstructor);

    const parentName = parentClass.getName() ?? "parent";
    return {
      success: true,
      filesChanged: [file],
      description: `Pulled constructor body of '${target}' up to '${parentName}'`,
    };
  },
  enumerate: enumerate.classes,
});
