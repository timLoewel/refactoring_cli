import type { Project, SourceFile } from "ts-morph";
import type { PreconditionResult } from "./refactoring.types.js";

type PreconditionCheck = (project: Project, context: PreconditionContext) => string | null;

export interface PreconditionContext {
  filePath?: string;
  symbolName?: string;
  startLine?: number;
  endLine?: number;
}

function ok(): PreconditionResult {
  return { ok: true, errors: [] };
}

function fail(errors: string[]): PreconditionResult {
  return { ok: false, errors };
}

export function runPreconditions(
  checks: PreconditionCheck[],
  project: Project,
  context: PreconditionContext,
): PreconditionResult {
  const errors: string[] = [];
  for (const check of checks) {
    const error = check(project, context);
    if (error !== null) {
      errors.push(error);
    }
  }
  return errors.length === 0 ? ok() : fail(errors);
}

// --- Reusable precondition checks ---

export function fileExists(project: Project, context: PreconditionContext): string | null {
  if (!context.filePath) {
    return "filePath is required";
  }
  const sf = project.getSourceFile(context.filePath);
  if (!sf) {
    return `File not found in project: ${context.filePath}`;
  }
  return null;
}

export function fileCompiles(_project: Project, context: PreconditionContext): string | null {
  if (!context.filePath) {
    return "filePath is required";
  }
  // ts-morph already reports diagnostics through the project
  return null;
}

export function symbolExistsInFile(project: Project, context: PreconditionContext): string | null {
  if (!context.filePath || !context.symbolName) {
    return "filePath and symbolName are required";
  }
  const sf = project.getSourceFile(context.filePath);
  if (!sf) {
    return `File not found: ${context.filePath}`;
  }
  const found = findSymbolInFile(sf, context.symbolName);
  if (!found) {
    return `Symbol '${context.symbolName}' not found in ${context.filePath}`;
  }
  return null;
}

function findSymbolInFile(sf: SourceFile, name: string): boolean {
  // Check variable declarations, functions, classes, interfaces, type aliases, enums
  for (const decl of sf.getVariableDeclarations()) {
    if (decl.getName() === name) return true;
  }
  for (const decl of sf.getFunctions()) {
    if (decl.getName() === name) return true;
  }
  for (const decl of sf.getClasses()) {
    if (decl.getName() === name) return true;
  }
  for (const decl of sf.getInterfaces()) {
    if (decl.getName() === name) return true;
  }
  for (const decl of sf.getTypeAliases()) {
    if (decl.getName() === name) return true;
  }
  for (const decl of sf.getEnums()) {
    if (decl.getName() === name) return true;
  }
  return false;
}

export function lineRangeValid(_project: Project, context: PreconditionContext): string | null {
  if (context.startLine !== undefined && context.endLine !== undefined) {
    if (context.startLine < 1) {
      return "startLine must be >= 1";
    }
    if (context.endLine < context.startLine) {
      return "endLine must be >= startLine";
    }
  }
  return null;
}
