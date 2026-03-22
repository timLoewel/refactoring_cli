import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface IntroduceParameterObjectParams {
  file: string;
  target: string;
  params: string;
  objectName: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to refactor",
      required: true,
    },
    {
      name: "params",
      type: "string",
      description: "Comma-separated parameter names to group into the object",
      required: true,
    },
    {
      name: "objectName",
      type: "string",
      description: "Name of the new parameter object",
      required: true,
    },
  ],
  validate(raw: unknown): IntroduceParameterObjectParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["params"] !== "string" || r["params"].trim() === "") {
      throw new Error("param 'params' must be a non-empty comma-separated string");
    }
    if (typeof r["objectName"] !== "string" || r["objectName"].trim() === "") {
      throw new Error("param 'objectName' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      params: r["params"] as string,
      objectName: r["objectName"] as string,
    };
  },
};

function preconditions(project: Project, p: IntroduceParameterObjectParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const fn = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.target);
  if (!fn) {
    errors.push(`Function '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const paramNames = p.params
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (paramNames.length < 2) {
    errors.push("At least 2 parameter names must be provided to group into an object");
  }

  const existingParamNames = fn.getParameters().map((ep) => ep.getName());
  for (const name of paramNames) {
    if (!existingParamNames.includes(name)) {
      errors.push(`Parameter '${name}' not found in function '${p.target}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: IntroduceParameterObjectParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const fn = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.target);
  if (!fn) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' not found`,
    };
  }

  const paramNames = p.params
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const existingParams = fn.getParameters();

  // Build type literal for the object from the grouped parameters
  const groupedParams = existingParams.filter((ep) => paramNames.includes(ep.getName()));
  const typeParts = groupedParams.map((ep) => {
    const typeNode = ep.getTypeNode();
    const typeName = typeNode ? typeNode.getText() : "unknown";
    return `${ep.getName()}: ${typeName}`;
  });
  const objectType = `{ ${typeParts.join("; ")} }`;

  // Record the index of first grouped param to know where to insert the object param
  const firstGroupedIndex = existingParams.findIndex((ep) => paramNames.includes(ep.getName()));

  // Remove grouped parameters in reverse order
  const toRemove = [...existingParams].filter((ep) => paramNames.includes(ep.getName()));
  const sortedRemove = [...toRemove].sort((a, b) => b.getChildIndex() - a.getChildIndex());
  for (const ep of sortedRemove) {
    ep.remove();
  }

  // Insert the new object parameter at the position of the first removed param
  const insertAt = firstGroupedIndex >= 0 ? firstGroupedIndex : 0;
  fn.insertParameter(insertAt, { name: p.objectName, type: objectType });

  // Replace usages of grouped param names in the body with objectName.paramName
  const body = fn.getBody();
  if (body) {
    const identifiers = body.getDescendantsOfKind(SyntaxKind.Identifier);
    const sortedIds = [...identifiers].sort((a, b) => b.getStart() - a.getStart());
    for (const id of sortedIds) {
      if (paramNames.includes(id.getText())) {
        id.replaceWithText(`${p.objectName}.${id.getText()}`);
      }
    }
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Grouped parameters [${paramNames.join(", ")}] of '${p.target}' into object '${p.objectName}'`,
  };
}

export const introduceParameterObject: RefactoringDefinition = {
  name: "Introduce Parameter Object",
  kebabName: "introduce-parameter-object",
  description:
    "Groups a set of parameters into a single parameter object to reduce argument lists.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as IntroduceParameterObjectParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as IntroduceParameterObjectParams),
};
