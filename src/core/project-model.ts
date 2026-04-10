import { Project } from "ts-morph";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { ok, err } from "neverthrow";
import { parseIgnoreFile } from "../utils/ignore.js";
import type { ProjectResult } from "./errors.js";

export interface LoadProjectOptions {
  path?: string;
  config?: string;
}

export interface ProjectModel {
  project: Project;
  projectRoot: string;
  sourceFiles: string[];
}

function findTsConfigUp(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveTsConfig(options: LoadProjectOptions): ProjectResult<string> {
  if (options.config) {
    const configPath = resolve(options.config);
    if (!existsSync(configPath)) {
      return err({ kind: "project", message: `tsconfig not found: ${configPath}` });
    }
    return ok(configPath);
  }

  const dir = options.path ? resolve(options.path) : process.cwd();
  const found = findTsConfigUp(dir);

  if (!found) {
    return err({
      kind: "project",
      message: `tsconfig.json not found in ${dir} or any parent directory`,
    });
  }

  return ok(found);
}

const DEFAULT_EXCLUDES = ["**/node_modules/**", "**/dist/**", "**/build/**"];

export function loadProject(options: LoadProjectOptions = {}): ProjectResult<ProjectModel> {
  const configResult = resolveTsConfig(options);
  if (configResult.isErr()) return err(configResult.error);
  const tsConfigPath = configResult.value;
  const projectRoot = dirname(tsConfigPath);

  const project = new Project({ tsConfigFilePath: tsConfigPath });

  const ignorePath = join(projectRoot, ".refactorignore");
  const ignorePatterns = existsSync(ignorePath)
    ? parseIgnoreFile(readFileSync(ignorePath, "utf-8"))
    : [];

  const allPatterns = [...DEFAULT_EXCLUDES, ...ignorePatterns];

  const sourceFiles = project
    .getSourceFiles()
    .map((sf) => sf.getFilePath())
    .filter((filePath) => !allPatterns.some((pattern) => matchesGlob(filePath, pattern)));

  return ok({ project, projectRoot, sourceFiles });
}

function matchesGlob(filePath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*");
  return new RegExp(regexStr).test(filePath);
}
