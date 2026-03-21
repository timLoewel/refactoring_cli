import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface PullUpMethodParams {
  file: string;
  target: string;
  method: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the subclass containing the method",
      required: true,
    },
    {
      name: "method",
      type: "string",
      description: "Name of the method to move to the superclass",
      required: true,
    },
  ],
  validate(raw: unknown): PullUpMethodParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["method"] !== "string" || r["method"].trim() === "") {
      throw new Error("param 'method' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      method: r["method"] as string,
    };
  },
};

function resolveParentClass(
  project: Project,
  file: string,
  subclassName: string,
): { parentName: string; error?: string } {
  const sf = project.getSourceFile(file);
  if (!sf) return { parentName: "", error: `File not found: ${file}` };
  const subclass = sf.getClass(subclassName);
  if (!subclass) return { parentName: "", error: `Class '${subclassName}' not found` };
  const extendsClause = subclass.getExtends();
  if (!extendsClause) return { parentName: "", error: `Class '${subclassName}' has no superclass` };
  return { parentName: extendsClause.getExpression().getText() };
}

function preconditions(project: Project, p: PullUpMethodParams): PreconditionResult {
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

  if (!subclass.getMethod(p.method)) {
    errors.push(`Method '${p.method}' not found in class '${p.target}'`);
  }

  const { parentName, error } = resolveParentClass(project, p.file, p.target);
  if (error) {
    errors.push(error);
  } else {
    const parentClass = sf.getClass(parentName);
    if (!parentClass) {
      errors.push(`Parent class '${parentName}' not found in file`);
    } else if (parentClass.getMethod(p.method)) {
      errors.push(`Method '${p.method}' already exists in parent class '${parentName}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: PullUpMethodParams): RefactoringResult {
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

  const method = subclass.getMethod(p.method);
  if (!method) {
    return {
      success: false,
      filesChanged: [],
      description: `Method '${p.method}' not found`,
      diff: [],
    };
  }

  const methodText = method.getText();

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

  method.remove();
  parentClass.addMember(methodText);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Pulled method '${p.method}' up from '${p.target}' to '${parentName}'`,
    diff: [],
  };
}

export const pullUpMethod: RefactoringDefinition = {
  name: "Pull Up Method",
  kebabName: "pull-up-method",
  description:
    "Moves a method from a subclass to its superclass, making it available to all siblings.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as PullUpMethodParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as PullUpMethodParams),
};
