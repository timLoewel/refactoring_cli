import type { Project } from "ts-morph";

export interface ParamDefinition {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

export interface ParamSchema<T = Record<string, unknown>> {
  definitions: ParamDefinition[];
  validate: (raw: unknown) => T;
}

export interface FileDiff {
  filePath: string;
  before: string;
  after: string;
}

export interface RefactoringResult {
  success: boolean;
  filesChanged: string[];
  description: string;
  diff: FileDiff[];
}

export interface PreconditionResult {
  ok: boolean;
  errors: string[];
}

export interface RefactoringDefinition<TParams = Record<string, unknown>> {
  name: string;
  kebabName: string;
  description: string;
  tier: 1 | 2 | 3 | 4;
  params: ParamSchema<TParams>;
  preconditions: (project: Project, params: TParams) => PreconditionResult;
  apply: (project: Project, params: TParams) => RefactoringResult;
}
