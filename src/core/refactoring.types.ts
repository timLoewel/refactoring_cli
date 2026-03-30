import type { Block, ClassDeclaration, FunctionDeclaration, Project, SourceFile } from "ts-morph";

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

export interface RefactoringDefinition {
  name: string;
  kebabName: string;
  description: string;
  tier: 1 | 2 | 3 | 4;
  language: "typescript" | "python";
  params: ParamSchema;
  preconditions: (project: Project, params: unknown) => PreconditionResult;
  apply: (project: Project, params: unknown) => RefactoringResult;
}
