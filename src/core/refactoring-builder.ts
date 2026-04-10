import { Node, SyntaxKind } from "ts-morph";
import type { Block, Project } from "ts-morph";
import { ok, err, type Result } from "neverthrow";
import type {
  ClassContext,
  EnumerateCandidate,
  FunctionContext,
  ParamDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringDefinition,
  RefactoringResult,
  SourceFileContext,
} from "./refactoring.types.js";
import type { ParamError, ParamResult } from "./errors.js";
import { registry } from "./refactoring-registry.js";

interface ParamHelper {
  definition: ParamDefinition;
  validate: (raw: Record<string, unknown>) => ParamResult<unknown>;
}

function paramErr(name: string, message: string): ParamResult<unknown> {
  return err({ kind: "param" as const, param: name, message });
}

function fileParam(name = "file", description = "Path to the TypeScript file"): ParamHelper {
  return {
    definition: { name, type: "string", description, required: true },
    validate(raw): ParamResult<unknown> {
      const value = raw[name];
      if (typeof value !== "string" || value.trim() === "") {
        return paramErr(name, "must be a non-empty string");
      }
      return ok(value);
    },
  };
}

function stringParam(name: string, description: string, required = true): ParamHelper {
  return {
    definition: { name, type: "string", description, required },
    validate(raw): ParamResult<unknown> {
      const value = raw[name];
      if (required) {
        if (typeof value !== "string" || value.trim() === "") {
          return paramErr(name, "must be a non-empty string");
        }
      } else if (value !== undefined && typeof value !== "string") {
        return paramErr(name, "must be a string");
      }
      return ok(value);
    },
  };
}

function identifierParam(name: string, description: string, required = true): ParamHelper {
  return {
    definition: { name, type: "string", description, required },
    validate(raw): ParamResult<unknown> {
      const value = raw[name];
      if (required) {
        if (typeof value !== "string" || value.trim() === "") {
          return paramErr(name, "must be a non-empty string");
        }
      } else if (value !== undefined && typeof value !== "string") {
        return paramErr(name, "must be a string");
      }
      if (typeof value === "string" && !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
        return paramErr(name, "must be a valid identifier");
      }
      return ok(value);
    },
  };
}

function numberParam(name: string, description: string, required = true): ParamHelper {
  return {
    definition: { name, type: "number", description, required },
    validate(raw): ParamResult<unknown> {
      const value = raw[name];
      if (required) {
        if (typeof value !== "number" || Number.isNaN(value)) {
          return paramErr(name, "must be a number");
        }
      } else if (value !== undefined && (typeof value !== "number" || Number.isNaN(value))) {
        return paramErr(name, "must be a number");
      }
      return ok(value);
    },
  };
}

// ---------------------------------------------------------------------------
// Resolver result type (neverthrow-based)
// ---------------------------------------------------------------------------

export type ResolveResult<T> = Result<T, RefactoringResult>;

// ---------------------------------------------------------------------------
// Shared resolvers
// ---------------------------------------------------------------------------

function failureResult(description: string): RefactoringResult {
  return { success: false, filesChanged: [], description };
}

function resolveSourceFile(
  project: Project,
  params: Record<string, unknown>,
): ResolveResult<SourceFileContext> {
  const file = params["file"] as string;
  const sourceFile = project.getSourceFile(file);
  if (!sourceFile) {
    return err(failureResult(`File not found in project: ${file}`));
  }
  return ok({ sourceFile });
}

function resolveFunction(
  project: Project,
  params: Record<string, unknown>,
): ResolveResult<FunctionContext> {
  return resolveSourceFile(project, params).andThen(({ sourceFile }) => {
    const target = params["target"] as string;

    const fn = sourceFile
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === target);
    if (!fn) {
      return err(failureResult(`Function '${target}' not found in file`));
    }

    const body = fn.getBody();
    if (!body || body.getKind() !== SyntaxKind.Block) {
      return err(failureResult(`Function '${target}' has no block body`));
    }

    return ok({ sourceFile, fn, body: body as Block });
  });
}

function resolveClass(
  project: Project,
  params: Record<string, unknown>,
): ResolveResult<ClassContext> {
  return resolveSourceFile(project, params).andThen(({ sourceFile }) => {
    const target = params["target"] as string;

    const cls = sourceFile.getClass(target);
    if (!cls) {
      return err(failureResult(`Class '${target}' not found in file`));
    }

    return ok({ sourceFile, cls });
  });
}

// ---------------------------------------------------------------------------
// Bundled param helpers and resolvers (reduces symbol fan-in)
// ---------------------------------------------------------------------------

export const param = {
  file: fileParam,
  string: stringParam,
  identifier: identifierParam,
  number: numberParam,
} as const;

export const resolve = {
  sourceFile: resolveSourceFile,
  function: resolveFunction,
  class: resolveClass,
} as const;

// ---------------------------------------------------------------------------
// Common enumerate helpers
// ---------------------------------------------------------------------------

function enumerateVariables(project: Project): EnumerateCandidate[] {
  const candidates: EnumerateCandidate[] = [];
  for (const sf of project.getSourceFiles()) {
    const file = sf.getFilePath();
    for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const name = decl.getName();
      if (name) candidates.push({ file, target: name });
    }
  }
  return candidates;
}

function enumerateFunctions(project: Project): EnumerateCandidate[] {
  const candidates: EnumerateCandidate[] = [];
  for (const sf of project.getSourceFiles()) {
    const file = sf.getFilePath();
    for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
      const name = fn.getName();
      if (name) candidates.push({ file, target: name });
    }
    for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const init = decl.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        const name = decl.getName();
        if (name) candidates.push({ file, target: name });
      }
    }
  }
  return candidates;
}

function enumerateClasses(project: Project): EnumerateCandidate[] {
  const candidates: EnumerateCandidate[] = [];
  for (const sf of project.getSourceFiles()) {
    const file = sf.getFilePath();
    for (const cls of sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      const name = cls.getName();
      if (name) candidates.push({ file, target: name });
    }
  }
  return candidates;
}

function enumerateVariablesAndFunctions(project: Project): EnumerateCandidate[] {
  const candidates: EnumerateCandidate[] = [];
  for (const sf of project.getSourceFiles()) {
    const file = sf.getFilePath();
    for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const name = decl.getName();
      if (name) candidates.push({ file, target: name });
    }
    for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
      const name = fn.getName();
      if (name) candidates.push({ file, target: name });
    }
  }
  return candidates;
}

export const enumerate = {
  variables: enumerateVariables,
  functions: enumerateFunctions,
  classes: enumerateClasses,
  variablesAndFunctions: enumerateVariablesAndFunctions,
} as const;

// ---------------------------------------------------------------------------
// defineRefactoring builder
// ---------------------------------------------------------------------------

export interface DefineRefactoringConfig<TContext = Project> {
  name: string;
  kebabName: string;
  tier: 1 | 2 | 3 | 4;
  description: string;
  params: ParamHelper[];
  resolve?: (project: Project, params: Record<string, unknown>) => ResolveResult<TContext>;
  preconditions?: (context: TContext, params: Record<string, unknown>) => PreconditionResult;
  apply: (context: TContext, params: Record<string, unknown>) => RefactoringResult;
  enumerate?: (project: Project) => EnumerateCandidate[];
}

function buildParamSchema(helpers: ParamHelper[]): ParamSchema {
  return {
    definitions: helpers.map((h): ParamDefinition => h.definition),
    validate(raw: unknown): ParamResult<unknown> {
      const record = raw as Record<string, unknown>;
      for (const helper of helpers) {
        const result = helper.validate(record);
        if (result.isErr()) return result;
      }
      return ok(record);
    },
  };
}

export function defineRefactoring<TContext = Project>(
  config: DefineRefactoringConfig<TContext>,
): RefactoringDefinition {
  const paramSchema = buildParamSchema(config.params);

  const definition: RefactoringDefinition = {
    name: config.name,
    kebabName: config.kebabName,
    description: config.description,
    tier: config.tier,
    params: paramSchema,

    preconditions(project: Project, raw: unknown): PreconditionResult {
      const validationResult = paramSchema.validate(raw);
      if (validationResult.isErr()) {
        const e = validationResult.error;
        return { ok: false, errors: [`param '${e.param}': ${e.message}`] };
      }
      const validated = validationResult.value as Record<string, unknown>;

      if (config.resolve) {
        const resolved = config.resolve(project, validated);
        if (resolved.isErr()) {
          return { ok: false, errors: [resolved.error.description] };
        }
        if (config.preconditions) {
          return config.preconditions(resolved.value, validated);
        }
        return { ok: true, errors: [] };
      }

      if (config.preconditions) {
        return config.preconditions(project as unknown as TContext, validated);
      }
      return { ok: true, errors: [] };
    },

    apply(project: Project, raw: unknown): RefactoringResult {
      const validationResult = paramSchema.validate(raw);
      if (validationResult.isErr()) {
        const e = validationResult.error;
        return failureResult(`param '${e.param}': ${e.message}`);
      }
      const validated = validationResult.value as Record<string, unknown>;

      if (config.resolve) {
        const resolved = config.resolve(project, validated);
        if (resolved.isErr()) {
          return resolved.error;
        }
        return config.apply(resolved.value, validated);
      }

      return config.apply(project as unknown as TContext, validated);
    },

    ...(config.enumerate ? { enumerate: config.enumerate } : {}),
  };

  registry.register(definition);
  return definition;
}
