import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface PullUpConstructorBodyParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the subclass whose constructor body to pull up",
      required: true,
    },
  ],
  validate(raw: unknown): PullUpConstructorBodyParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
    };
  },
};

function preconditions(project: Project, p: PullUpConstructorBodyParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const subclass = sf.getClass(p.target);
  if (!subclass) {
    errors.push(`Class '${p.target}' not found in file`);
    return { ok: false, errors };
  }

  const constructor = subclass.getConstructors()[0];
  if (!constructor) {
    errors.push(`Class '${p.target}' has no constructor`);
    return { ok: false, errors };
  }

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    errors.push(`Class '${p.target}' does not extend any class`);
    return { ok: false, errors };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);
  if (!parentClass) {
    errors.push(`Parent class '${parentName}' not found in file`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: PullUpConstructorBodyParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const subclass = sf.getClass(p.target);
  if (!subclass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
      diff: [],
    };
  }

  const subConstructor = subclass.getConstructors()[0];
  if (!subConstructor) {
    return {
      success: false,
      filesChanged: [],
      description: `No constructor in '${p.target}'`,
      diff: [],
    };
  }

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' has no superclass`,
      diff: [],
    };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);
  if (!parentClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Parent class '${parentName}' not found`,
      diff: [],
    };
  }

  const subParams = subConstructor
    .getParameters()
    .map((param) => param.getText())
    .join(", ");
  const subBody = subConstructor.getBody();
  const bodyStatements = subBody && Node.isBlock(subBody) ? subBody.getStatements() : [];
  const nonSuperStatements = bodyStatements
    .map((s) => s.getText())
    .filter((text: string) => !text.startsWith("super("));

  const existingParentConstructor = parentClass.getConstructors()[0];
  if (existingParentConstructor) {
    for (const statement of nonSuperStatements) {
      existingParentConstructor.addStatements(statement);
    }
  } else {
    parentClass.addConstructor({
      parameters: subParams ? [{ name: subParams }] : [],
      statements: nonSuperStatements,
    });
  }

  // Simplify subclass constructor to only retain the super() call
  const freshSubBody = subConstructor.getBody();
  if (freshSubBody && Node.isBlock(freshSubBody)) {
    const stmtsToRemove = freshSubBody
      .getStatements()
      .filter((s) => !s.getText().startsWith("super("));
    for (const stmt of [...stmtsToRemove].reverse()) {
      stmt.remove();
    }
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Pulled constructor body of '${p.target}' up to '${parentName}'`,
    diff: [],
  };
}

export const pullUpConstructorBody: RefactoringDefinition = {
  name: "Pull Up Constructor Body",
  kebabName: "pull-up-constructor-body",
  description:
    "Moves common constructor initialization logic from a subclass up to the superclass constructor.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as PullUpConstructorBodyParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as PullUpConstructorBodyParams),
};
