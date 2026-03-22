import type { Project } from "ts-morph";

export interface ParamDefinition {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

export interface ParamSchema {
  definitions: ParamDefinition[];
  validate: (raw: unknown) => unknown;
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
}

export interface ApplyResult extends RefactoringResult {
  diff: FileDiff[];
}

export interface PreconditionResult {
  ok: boolean;
  errors: string[];
}

export interface RefactoringDefinition {
  name: string;
  kebabName: string;
  description: string;
  tier: 1 | 2 | 3 | 4;
  params: ParamSchema;
  preconditions: (project: Project, params: unknown) => PreconditionResult;
  apply: (project: Project, params: unknown) => RefactoringResult;
}
