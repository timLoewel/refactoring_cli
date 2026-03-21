import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface CollapseHierarchyParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the subclass to collapse into its parent",
      required: true,
    },
  ],
  validate(raw: unknown): CollapseHierarchyParams {
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

function preconditions(project: Project, p: CollapseHierarchyParams): PreconditionResult {
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

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    errors.push(`Class '${p.target}' does not extend any class`);
    return { ok: false, errors };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);
  if (!parentClass) {
    errors.push(`Parent class '${parentName}' not found in file — cannot collapse across files`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: CollapseHierarchyParams): RefactoringResult {
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
      description: `Parent class '${parentName}' not found in file`,
      diff: [],
    };
  }

  // Move members from subclass to parent
  const subMembers = subclass.getMembers();
  for (const member of subMembers) {
    parentClass.addMember(member.getText());
  }

  subclass.remove();

  return {
    success: true,
    filesChanged: [p.file],
    description: `Collapsed subclass '${p.target}' into parent class '${parentName}'`,
    diff: [],
  };
}

export const collapseHierarchy: RefactoringDefinition = {
  name: "Collapse Hierarchy",
  kebabName: "collapse-hierarchy",
  description:
    "Merges a subclass that adds nothing meaningful back into its parent class and removes the subclass.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as CollapseHierarchyParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as CollapseHierarchyParams),
};
