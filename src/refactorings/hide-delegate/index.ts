import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface HideDelegateParams {
  file: string;
  target: string;
  delegate: string;
  method: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class to add the delegating method to",
      required: true,
    },
    {
      name: "delegate",
      type: "string",
      description: "Name of the delegate field on the target class",
      required: true,
    },
    {
      name: "method",
      type: "string",
      description: "Name of the method on the delegate to expose",
      required: true,
    },
  ],
  validate(raw: unknown): HideDelegateParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["delegate"] !== "string" || r["delegate"].trim() === "") {
      throw new Error("param 'delegate' must be a non-empty string");
    }
    if (typeof r["method"] !== "string" || r["method"].trim() === "") {
      throw new Error("param 'method' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      delegate: r["delegate"] as string,
      method: r["method"] as string,
    };
  },
};

function preconditions(project: Project, p: HideDelegateParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const targetClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!targetClass) {
    errors.push(`Class '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const delegateProp = targetClass.getProperty(p.delegate);
  if (!delegateProp) {
    errors.push(`Delegate field '${p.delegate}' not found on class '${p.target}'`);
  }

  const existingMethod = targetClass.getMethod(p.method);
  if (existingMethod) {
    errors.push(`Method '${p.method}' already exists on class '${p.target}'`);
  }

  return { ok: errors.length === 0, errors };
}

function buildDelegatingMethod(delegate: string, method: string): string {
  return `  ${method}(): unknown { return this.${delegate}.${method}(); }`;
}

function apply(project: Project, p: HideDelegateParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const targetClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!targetClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
      diff: [],
    };
  }

  const delegatingMethod = buildDelegatingMethod(p.delegate, p.method);
  targetClass.addMember(delegatingMethod);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Added delegating method '${p.method}()' to class '${p.target}' hiding delegate field '${p.delegate}'`,
    diff: [],
  };
}

export const hideDelegate: RefactoringDefinition = {
  name: "Hide Delegate",
  kebabName: "hide-delegate",
  description:
    "Adds a forwarding method to a class that delegates to a field, hiding the delegate from callers.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as HideDelegateParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as HideDelegateParams),
};
