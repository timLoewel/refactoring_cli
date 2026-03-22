import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface RemoveSubclassParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the subclass to remove",
      required: true,
    },
  ],
  validate(raw: unknown): RemoveSubclassParams {
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

function preconditions(project: Project, p: RemoveSubclassParams): PreconditionResult {
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
    errors.push(`Class '${p.target}' does not extend any class — it is not a subclass`);
    return { ok: false, errors };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);
  if (!parentClass) {
    errors.push(`Parent class '${parentName}' not found in file`);
  }

  return { ok: errors.length === 0, errors };
}

function buildTypeFieldName(subclassName: string): string {
  return subclassName.charAt(0).toLowerCase() + subclassName.slice(1) + "Type";
}

function apply(project: Project, p: RemoveSubclassParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const subclass = sf.getClass(p.target);
  if (!subclass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
    };
  }

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' has no superclass`,
    };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);
  if (!parentClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Parent class '${parentName}' not found`,
    };
  }

  const typeFieldName = buildTypeFieldName(p.target);
  const typeValue = p.target.toLowerCase();

  // Add a type discriminator field to the parent if not present
  if (!parentClass.getProperty(typeFieldName)) {
    parentClass.addMember(`${typeFieldName}: string = "${typeValue}";`);
  }

  // Move members from subclass to parent before removal
  const subMembers = subclass.getMembers();
  for (const member of subMembers) {
    parentClass.addMember(member.getText());
  }

  subclass.remove();

  return {
    success: true,
    filesChanged: [p.file],
    description: `Removed subclass '${p.target}', merged into '${parentName}' with type field '${typeFieldName}'`,
  };
}

export const removeSubclass: RefactoringDefinition = {
  name: "Remove Subclass",
  kebabName: "remove-subclass",
  description:
    "Removes a subclass by merging it into its parent and replacing the subclass distinction with a type field.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as RemoveSubclassParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as RemoveSubclassParams),
};
