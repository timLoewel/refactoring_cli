import { SyntaxKind } from "ts-morph";
import type { Project, MethodDeclaration } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface RemoveMiddleManParams {
  file: string;
  target: string;
  delegate: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class acting as middle man",
      required: true,
    },
    {
      name: "delegate",
      type: "string",
      description: "Name of the delegate field whose methods are being forwarded",
      required: true,
    },
  ],
  validate(raw: unknown): RemoveMiddleManParams {
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
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      delegate: r["delegate"] as string,
    };
  },
};

function preconditions(project: Project, p: RemoveMiddleManParams): PreconditionResult {
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

  return { ok: errors.length === 0, errors };
}

function isDelegatingMethod(method: MethodDeclaration, delegateName: string): boolean {
  const body = method.getBody();
  if (!body) {
    return false;
  }
  const bodyText = body.getText();
  return bodyText.includes(`this.${delegateName}.`);
}

function apply(project: Project, p: RemoveMiddleManParams): RefactoringResult {
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

  const delegatingMethods = targetClass
    .getMethods()
    .filter((method) => isDelegatingMethod(method, p.delegate));

  const removedNames = delegatingMethods.map((method) => method.getName());

  // Remove in reverse order to keep positions stable
  const reversedMethods = [...delegatingMethods].reverse();
  for (const method of reversedMethods) {
    method.remove();
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Removed ${removedNames.length} delegating method(s) [${removedNames.join(", ")}] from '${p.target}', exposing delegate '${p.delegate}' directly`,
    diff: [],
  };
}

export const removeMiddleMan: RefactoringDefinition = {
  name: "Remove Middle Man",
  kebabName: "remove-middle-man",
  description:
    "Removes methods that merely forward calls to a delegate field, exposing the delegate directly.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as RemoveMiddleManParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as RemoveMiddleManParams),
};
