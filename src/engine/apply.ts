import type { Project } from "ts-morph";
import type { RefactoringDefinition, RefactoringResult, FileDiff } from "./refactoring.types.js";

export interface ApplyOptions {
  dryRun?: boolean;
}

export function applyRefactoring(
  definition: RefactoringDefinition,
  project: Project,
  params: Record<string, unknown>,
  options: ApplyOptions = {},
): RefactoringResult {
  // Validate params
  const validatedParams = definition.params.validate(params);

  // Run preconditions
  const preconditionResult = definition.preconditions(project, validatedParams);
  if (!preconditionResult.ok) {
    return {
      success: false,
      filesChanged: [],
      description: `Precondition failed: ${preconditionResult.errors.join("; ")}`,
      diff: [],
    };
  }

  // Capture file contents before transformation
  const beforeSnapshots = captureSnapshots(project);

  // Apply transformation
  let result: RefactoringResult;
  try {
    result = definition.apply(project, validatedParams);
  } catch (error) {
    // Rollback: revert all files to before state
    rollbackSnapshots(project, beforeSnapshots);
    return {
      success: false,
      filesChanged: [],
      description: `Transformation error: ${error instanceof Error ? error.message : String(error)}`,
      diff: [],
    };
  }

  if (!result.success) {
    rollbackSnapshots(project, beforeSnapshots);
    return result;
  }

  // Compute diffs
  const afterSnapshots = captureSnapshots(project);
  const diffs = computeDiffs(beforeSnapshots, afterSnapshots);

  if (options.dryRun) {
    // Rollback without saving
    rollbackSnapshots(project, beforeSnapshots);
    return {
      success: true,
      filesChanged: diffs.map((d) => d.filePath),
      description: result.description,
      diff: diffs,
    };
  }

  // Atomic write: save all changed files
  try {
    project.saveSync();
  } catch (error) {
    rollbackSnapshots(project, beforeSnapshots);
    return {
      success: false,
      filesChanged: [],
      description: `Failed to save files: ${error instanceof Error ? error.message : String(error)}`,
      diff: [],
    };
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
