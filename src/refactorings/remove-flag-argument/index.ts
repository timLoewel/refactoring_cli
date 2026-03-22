import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface RemoveFlagArgumentParams {
  file: string;
  target: string;
  flag: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function with the flag argument",
      required: true,
    },
    {
      name: "flag",
      type: "string",
      description: "Name of the boolean flag parameter to remove",
      required: true,
    },
  ],
  validate(raw: unknown): RemoveFlagArgumentParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["flag"] !== "string" || r["flag"].trim() === "") {
      throw new Error("param 'flag' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      flag: r["flag"] as string,
    };
  },
};

function preconditions(project: Project, p: RemoveFlagArgumentParams): PreconditionResult {
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

  const flagParam = fn.getParameters().find((param) => param.getName() === p.flag);
  if (!flagParam) {
    errors.push(`Parameter '${p.flag}' not found in function '${p.target}'`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: RemoveFlagArgumentParams): RefactoringResult {
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

  const parameters = fn.getParameters();
  const flagIndex = parameters.findIndex((param) => param.getName() === p.flag);
  if (flagIndex === -1) {
    return {
      success: false,
      filesChanged: [],
      description: `Parameter '${p.flag}' not found in function '${p.target}'`,
    };
  }

  const trueName = `${p.target}WhenTrue`;
  const falseName = `${p.target}WhenFalse`;

  // Get the body text of the original function
  const body = fn.getBody();
  const bodyText = body ? body.getText() : "{}";

  // Build two new functions — callers can specialize them further
  const trueFunc = `\nfunction ${trueName}(${parameters
    .filter((_, i) => i !== flagIndex)
    .map((par) => par.getText())
    .join(", ")}): void ${bodyText}\n`;

  const falseFunc = `\nfunction ${falseName}(${parameters
    .filter((_, i) => i !== flagIndex)
    .map((par) => par.getText())
    .join(", ")}): void ${bodyText}\n`;

  // Update call sites: replace calls with flag=true/false with the appropriate variant
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
    return c.getExpression().getText() === p.target;
  });

  const sortedCalls = [...calls].sort((a, b) => b.getStart() - a.getStart());
  for (const call of sortedCalls) {
    const args = call.getArguments();
    const flagArg = args[flagIndex];
    const flagValue = flagArg ? flagArg.getText() : "true";
    const newName = flagValue === "false" ? falseName : trueName;
    const newArgs = args.filter((_, i) => i !== flagIndex).map((a) => a.getText());
    call.replaceWithText(`${newName}(${newArgs.join(", ")})`);
  }

  // Remove original function and add two specialized ones
  fn.remove();
  sf.addStatements(trueFunc);
  sf.addStatements(falseFunc);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Split function '${p.target}' on flag '${p.flag}' into '${trueName}' and '${falseName}'`,
  };
}

export const removeFlagArgument: RefactoringDefinition = {
  name: "Remove Flag Argument",
  kebabName: "remove-flag-argument",
  description: "Splits a function that accepts a boolean flag into two specialized functions.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as RemoveFlagArgumentParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as RemoveFlagArgumentParams),
};
