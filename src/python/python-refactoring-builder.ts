import type { Project } from "ts-morph";
import type {
  ParamDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringDefinition,
  RefactoringResult,
} from "../core/refactoring.types.js";
import { registry } from "../core/refactoring-registry.js";
import type { PyrightClient } from "./pyright-client.js";
import type Parser from "tree-sitter";

// ---------------------------------------------------------------------------
// Python project context — wraps pyright LSP + tree-sitter parser
// ---------------------------------------------------------------------------

export interface PythonProjectContext {
  pyright: PyrightClient;
  parser: Parser;
  projectRoot: string;
}

// ---------------------------------------------------------------------------
// Param helpers (reused from TS builder pattern)
// ---------------------------------------------------------------------------

interface ParamHelper {
  definition: ParamDefinition;
  validate: (raw: Record<string, unknown>) => unknown;
}

function fileParam(name = "file", description = "Path to the Python file"): ParamHelper {
  return {
    definition: { name, type: "string", description, required: true },
    validate(raw): unknown {
      const value = raw[name];
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`param '${name}' must be a non-empty string`);
      }
      return value;
    },
  };
}

function stringParam(name: string, description: string, required = true): ParamHelper {
  return {
    definition: { name, type: "string", description, required },
    validate(raw): unknown {
      const value = raw[name];
      if (required) {
        if (typeof value !== "string" || value.trim() === "") {
          throw new Error(`param '${name}' must be a non-empty string`);
        }
      } else if (value !== undefined && typeof value !== "string") {
        throw new Error(`param '${name}' must be a string`);
      }
      return value;
    },
  };
}

function identifierParam(name: string, description: string, required = true): ParamHelper {
  return {
    definition: { name, type: "string", description, required },
    validate(raw): unknown {
      const value = raw[name];
      if (required) {
        if (typeof value !== "string" || value.trim() === "") {
          throw new Error(`param '${name}' must be a non-empty string`);
        }
      } else if (value !== undefined && typeof value !== "string") {
        throw new Error(`param '${name}' must be a string`);
      }
      // Python identifiers: letter or underscore, then letters/digits/underscores
      if (typeof value === "string" && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
        throw new Error(`param '${name}' must be a valid Python identifier`);
      }
      return value;
    },
  };
}

function numberParam(name: string, description: string, required = true): ParamHelper {
  return {
    definition: { name, type: "number", description, required },
    validate(raw): unknown {
      const value = raw[name];
      if (required) {
        if (typeof value !== "number" || Number.isNaN(value)) {
          throw new Error(`param '${name}' must be a number`);
        }
      } else if (value !== undefined && (typeof value !== "number" || Number.isNaN(value))) {
        throw new Error(`param '${name}' must be a number`);
      }
      return value;
    },
  };
}

export const pythonParam = {
  file: fileParam,
  string: stringParam,
  identifier: identifierParam,
  number: numberParam,
} as const;

// ---------------------------------------------------------------------------
// Builder config
// ---------------------------------------------------------------------------

interface ResolveSuccess<T> {
  ok: true;
  value: T;
}

interface ResolveFailure {
  ok: false;
  result: RefactoringResult;
}

type ResolveResult<T> = ResolveSuccess<T> | ResolveFailure;

export interface DefinePythonRefactoringConfig<TContext = PythonProjectContext> {
  name: string;
  kebabName: string;
  tier: 1 | 2 | 3 | 4;
  description: string;
  params: ParamHelper[];
  resolve?: (ctx: PythonProjectContext, params: Record<string, unknown>) => ResolveResult<TContext>;
  preconditions?: (context: TContext, params: Record<string, unknown>) => PreconditionResult;
  apply: (context: TContext, params: Record<string, unknown>) => RefactoringResult;
}

// ---------------------------------------------------------------------------
// definePythonRefactoring
// ---------------------------------------------------------------------------

function buildParamSchema(helpers: ParamHelper[]): ParamSchema {
  return {
    definitions: helpers.map((h): ParamDefinition => h.definition),
    validate(raw: unknown): unknown {
      const record = raw as Record<string, unknown>;
      for (const helper of helpers) {
        helper.validate(record);
      }
      return record;
    },
  };
}

/**
 * The Python project context is stored here by the CLI layer
 * before any Python refactoring is applied. This avoids threading
 * the context through the generic RefactoringDefinition.apply(Project, params)
 * signature which expects a ts-morph Project.
 */
let activePythonContext: PythonProjectContext | null = null;

export function setPythonContext(ctx: PythonProjectContext | null): void {
  activePythonContext = ctx;
}

export function getPythonContext(): PythonProjectContext | null {
  return activePythonContext;
}

export function definePythonRefactoring<TContext = PythonProjectContext>(
  config: DefinePythonRefactoringConfig<TContext>,
): RefactoringDefinition {
  const paramSchema = buildParamSchema(config.params);

  function getContext(): PythonProjectContext {
    if (!activePythonContext) {
      throw new Error(
        "No Python project context set. Ensure pyright is initialized before applying Python refactorings.",
      );
    }
    return activePythonContext;
  }

  const definition: RefactoringDefinition = {
    name: config.name,
    kebabName: config.kebabName,
    description: config.description,
    tier: config.tier,
    language: "python",
    params: paramSchema,

    preconditions(_project: Project, raw: unknown): PreconditionResult {
      const validated = paramSchema.validate(raw) as Record<string, unknown>;
      const ctx = getContext();

      if (config.resolve) {
        const resolved = config.resolve(ctx, validated);
        if (!resolved.ok) {
          return { ok: false, errors: [resolved.result.description] };
        }
        if (config.preconditions) {
          return config.preconditions(resolved.value, validated);
        }
        return { ok: true, errors: [] };
      }

      if (config.preconditions) {
        return config.preconditions(ctx as unknown as TContext, validated);
      }
      return { ok: true, errors: [] };
    },

    apply(_project: Project, raw: unknown): RefactoringResult {
      const validated = paramSchema.validate(raw) as Record<string, unknown>;
      const ctx = getContext();

      if (config.resolve) {
        const resolved = config.resolve(ctx, validated);
        if (!resolved.ok) {
          return resolved.result;
        }
        return config.apply(resolved.value, validated);
      }

      return config.apply(ctx as unknown as TContext, validated);
    },
  };

  registry.register(definition);
  return definition;
}
