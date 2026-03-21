import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceSubclassWithDelegateParams {
  file: string;
  target: string;
  delegateClassName: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the subclass to replace with delegation",
      required: true,
    },
    {
      name: "delegateClassName",
      type: "string",
      description: "Name for the new delegate class",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceSubclassWithDelegateParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["delegateClassName"] !== "string" || r["delegateClassName"].trim() === "") {
      throw new Error("param 'delegateClassName' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      delegateClassName: r["delegateClassName"] as string,
    };
  },
};

function preconditions(project: Project, p: ReplaceSubclassWithDelegateParams): PreconditionResult {
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
  }

  if (sf.getClass(p.delegateClassName)) {
    errors.push(`Class '${p.delegateClassName}' already exists in file`);
  }

  return { ok: errors.length === 0, errors };
}

function buildDelegateClass(delegateClassName: string, methodTexts: string[]): string {
  const body = methodTexts.length > 0 ? methodTexts.map((m) => `  ${m}`).join("\n\n") : "";
  return `class ${delegateClassName} {\n${body}\n}\n`;
}

function buildForwardingMethod(methodName: string, delegateField: string): string {
  return `  ${methodName}(): unknown { return this.${delegateField}.${methodName}(); }`;
}

function apply(project: Project, p: ReplaceSubclassWithDelegateParams): RefactoringResult {
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

  if (!subclass.getExtends()) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' has no superclass`,
      diff: [],
    };
  }

  // Collect subclass-specific methods (those not from the parent)
  const subclassMethods = subclass.getMethods();
  const methodTexts = subclassMethods.map((m) => m.getText());
  const methodNames = subclassMethods.map((m) => m.getName());

  const delegateField = p.delegateClassName.charAt(0).toLowerCase() + p.delegateClassName.slice(1);

  // Build delegate class with the subclass-specific methods
  const delegateClassText = buildDelegateClass(p.delegateClassName, methodTexts);
  sf.insertText(0, delegateClassText + "\n");

  // Remove the extends clause from the target class
  const refreshedClass = sf.getClass(p.target);
  if (refreshedClass) {
    refreshedClass.removeExtends();

    for (const methodName of methodNames) {
      const method = refreshedClass.getMethod(methodName);
      if (method) {
        method.remove();
      }
    }

    // Add delegate field and forwarding methods
    refreshedClass.addMember(
      `private ${delegateField}: ${p.delegateClassName} = new ${p.delegateClassName}();`,
    );

    for (const methodName of methodNames) {
      refreshedClass.addMember(buildForwardingMethod(methodName, delegateField));
    }
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced subclass '${p.target}' inheritance with delegation to new '${p.delegateClassName}'`,
    diff: [],
  };
}

export const replaceSubclassWithDelegate: RefactoringDefinition = {
  name: "Replace Subclass with Delegate",
  kebabName: "replace-subclass-with-delegate",
  description:
    "Replaces inheritance by creating a delegate class that holds the subclass behavior, turning the subclass into a standalone class.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceSubclassWithDelegateParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceSubclassWithDelegateParams),
};
