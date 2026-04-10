import type { Project } from "ts-morph";
import { Result } from "neverthrow";
import type {
  RefactoringDefinition,
  ApplyResult,
  FileDiff,
} from "./refactoring.types.js";

export interface ApplyOptions {
  dryRun?: boolean;
}

function failedResult(description: string): ApplyResult {
  return { success: false, filesChanged: [], description, diff: [] };
}

const safeApply = Result.fromThrowable(
  (definition: RefactoringDefinition, project: Project, validatedParams: unknown) =>
    definition.apply(project, validatedParams),
  (error): string =>
    `Transformation error: ${error instanceof Error ? error.message : String(error)}`,
);

const safeSave = Result.fromThrowable(
  (project: Project) => project.saveSync(),
  (error): string => (error instanceof Error ? error.message : String(error)),
);

export function applyRefactoring(
  definition: RefactoringDefinition,
  project: Project,
  params: Record<string, unknown>,
  options: ApplyOptions = {},
): ApplyResult {
  const validationResult = definition.params.validate(params);
  if (validationResult.isErr()) {
    const e = validationResult.error;
    return failedResult(`param '${e.param}': ${e.message}`);
  }
  const validatedParams = validationResult.value;

  const preconditionResult = definition.preconditions(project, validatedParams);
  if (!preconditionResult.ok) {
    return failedResult(`Precondition failed: ${preconditionResult.errors.join("; ")}`);
  }

  const beforeSnapshots = captureSnapshots(project);
  const applyResult = safeApply(definition, project, validatedParams);
  if (applyResult.isErr()) {
    rollbackSnapshots(project, beforeSnapshots);
    return failedResult(applyResult.error);
  }
  const result = applyResult.value;

  if (!result.success) {
    rollbackSnapshots(project, beforeSnapshots);
    return { ...result, diff: [] };
  }

  const diffs = computeDiffs(beforeSnapshots, captureSnapshots(project));

  if (options.dryRun) {
    rollbackSnapshots(project, beforeSnapshots);
    return {
      success: true,
      filesChanged: diffs.map((d) => d.filePath),
      description: result.description,
      diff: diffs,
    };
  }

  const saveResult = safeSave(project);
  if (saveResult.isErr()) {
    rollbackSnapshots(project, beforeSnapshots);
    return failedResult(`Failed to save files: ${saveResult.error}`);
  }

  return {
    success: true,
    filesChanged: diffs.map((d) => d.filePath),
    description: result.description,
    diff: diffs,
  };
}

function captureSnapshots(project: Project): Map<string, string> {
  const snapshots = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    snapshots.set(sf.getFilePath(), sf.getFullText());
  }
  return snapshots;
}

function rollbackSnapshots(project: Project, snapshots: Map<string, string>): void {
  for (const [filePath, content] of snapshots) {
    const sf = project.getSourceFile(filePath);
    if (sf) {
      sf.replaceWithText(content);
    }
  }
}

function computeDiffs(before: Map<string, string>, after: Map<string, string>): FileDiff[] {
  const diffs: FileDiff[] = [];
  for (const [filePath, afterContent] of after) {
    const beforeContent = before.get(filePath) ?? "";
    if (beforeContent !== afterContent) {
      diffs.push({ filePath, before: beforeContent, after: afterContent });
    }
  }
  return diffs;
}
