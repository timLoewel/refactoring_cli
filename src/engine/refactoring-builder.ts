import { SyntaxKind } from "ts-morph";
import type {
  Block,
  ClassDeclaration,
  FunctionDeclaration,
  Project,
  SourceFile,
  VariableDeclaration,
} from "ts-morph";
import type { ParamDefinition, RefactoringResult } from "./refactoring.types.js";

export interface ParamHelper {
  definition: ParamDefinition;
  validate: (raw: Record<string, unknown>) => unknown;
}

export function fileParam(name = "file", description = "Path to the TypeScript file"): ParamHelper {
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

export function stringParam(name: string, description: string, required = true): ParamHelper {
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

export function identifierParam(name: string, description: string, required = true): ParamHelper {
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
      if (typeof value === "string" && !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
        throw new Error(`param '${name}' must be a valid identifier`);
      }
      return value;
    },
  };
}

export function numberParam(name: string, description: string, required = true): ParamHelper {
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

// ---------------------------------------------------------------------------
// Resolver result types
// ---------------------------------------------------------------------------

interface ResolveSuccess<T> {
  ok: true;
  value: T;
}

interface ResolveFailure {
  ok: false;
  result: RefactoringResult;
}

export type ResolveResult<T> = ResolveSuccess<T> | ResolveFailure;

export interface SourceFileContext {
  sourceFile: SourceFile;
}

export interface FunctionContext {
  sourceFile: SourceFile;
  fn: FunctionDeclaration;
  body: Block;
}

export interface ClassContext {
  sourceFile: SourceFile;
  cls: ClassDeclaration;
}

export interface VariableContext {
  sourceFile: SourceFile;
  declaration: VariableDeclaration;
}

// ---------------------------------------------------------------------------
// Shared resolvers
// ---------------------------------------------------------------------------

function failureResult(description: string): RefactoringResult {
  return { success: false, filesChanged: [], description, diff: [] };
}

export function resolveSourceFile(
  project: Project,
  params: { file: string },
): ResolveResult<SourceFileContext> {
  const sourceFile = project.getSourceFile(params.file);
  if (!sourceFile) {
    return { ok: false, result: failureResult(`File not found in project: ${params.file}`) };
  }
  return { ok: true, value: { sourceFile } };
}

export function resolveFunction(
  project: Project,
  params: { file: string; target: string },
): ResolveResult<FunctionContext> {
  const fileResult = resolveSourceFile(project, params);
  if (!fileResult.ok) {
    return fileResult;
  }
  const { sourceFile } = fileResult.value;

  const fn = sourceFile
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === params.target);
  if (!fn) {
    return { ok: false, result: failureResult(`Function '${params.target}' not found in file`) };
  }

  const body = fn.getBody();
  if (!body || body.getKind() !== SyntaxKind.Block) {
    return { ok: false, result: failureResult(`Function '${params.target}' has no block body`) };
  }

  return { ok: true, value: { sourceFile, fn, body: body as Block } };
}

export function resolveClass(
  project: Project,
  params: { file: string; target: string },
): ResolveResult<ClassContext> {
  const fileResult = resolveSourceFile(project, params);
  if (!fileResult.ok) {
    return fileResult;
  }
  const { sourceFile } = fileResult.value;

  const cls = sourceFile.getClass(params.target);
  if (!cls) {
    return { ok: false, result: failureResult(`Class '${params.target}' not found in file`) };
  }

  return { ok: true, value: { sourceFile, cls } };
}

export function resolveVariable(
  project: Project,
  params: { file: string; target: string },
): ResolveResult<VariableContext> {
  const fileResult = resolveSourceFile(project, params);
  if (!fileResult.ok) {
    return fileResult;
  }
  const { sourceFile } = fileResult.value;

  const declaration = sourceFile
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((d) => d.getName() === params.target);
  if (!declaration) {
    return { ok: false, result: failureResult(`Variable '${params.target}' not found in file`) };
  }

  return { ok: true, value: { sourceFile, declaration } };
}
