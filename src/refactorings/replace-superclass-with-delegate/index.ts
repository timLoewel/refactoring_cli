import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceSuperclassWithDelegateParams {
  file: string;
  target: string;
  delegateFieldName: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class that currently inherits from a superclass",
      required: true,
    },
    {
      name: "delegateFieldName",
      type: "string",
      description: "Name for the new delegate field that will replace the superclass",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceSuperclassWithDelegateParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["delegateFieldName"] !== "string" || r["delegateFieldName"].trim() === "") {
      throw new Error("param 'delegateFieldName' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      delegateFieldName: r["delegateFieldName"] as string,
    };
  },
};

function preconditions(
  project: Project,
  p: ReplaceSuperclassWithDelegateParams,
): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const targetClass = sf.getClass(p.target);
  if (!targetClass) {
    errors.push(`Class '${p.target}' not found in file`);
    return { ok: false, errors };
  }

  const extendsClause = targetClass.getExtends();
  if (!extendsClause) {
    errors.push(`Class '${p.target}' does not extend any class`);
    return { ok: false, errors };
  }

  if (targetClass.getProperty(p.delegateFieldName)) {
    errors.push(`Field '${p.delegateFieldName}' already exists in class '${p.target}'`);
  }

  return { ok: errors.length === 0, errors };
}

function buildForwardingMethods(superclassMethods: string[], delegateFieldName: string): string[] {
  return superclassMethods.map(
    (methodName) =>
      `  ${methodName}(): unknown { return this.${delegateFieldName}.${methodName}(); }`,
  );
}

function apply(project: Project, p: ReplaceSuperclassWithDelegateParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const targetClass = sf.getClass(p.target);
  if (!targetClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
    };
  }

  const extendsClause = targetClass.getExtends();
  if (!extendsClause) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' has no superclass`,
    };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);

  // Collect superclass method names for forwarding
  const superclassMethodNames = parentClass ? parentClass.getMethods().map((m) => m.getName()) : [];

  // Remove the extends clause via the class API
  targetClass.removeExtends();

  // Add a delegate field pointing to an instance of the former superclass
  const refreshedClass = sf.getClass(p.target);
  if (!refreshedClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' disappeared after transformation`,
    };
  }

  refreshedClass.addMember(`private ${p.delegateFieldName}: ${parentName} = new ${parentName}();`);

  // Add forwarding methods for each inherited method
  const forwardingMethods = buildForwardingMethods(superclassMethodNames, p.delegateFieldName);
  for (const methodText of forwardingMethods) {
    refreshedClass.addMember(methodText);
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced superclass '${parentName}' in '${p.target}' with delegate field '${p.delegateFieldName}'`,
  };
}

export const replaceSuperclassWithDelegate: RefactoringDefinition = {
  name: "Replace Superclass with Delegate",
  kebabName: "replace-superclass-with-delegate",
  description:
    "Replaces a class's superclass inheritance with a delegate field, forwarding calls through composition instead of inheritance.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceSuperclassWithDelegateParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceSuperclassWithDelegateParams),
};
