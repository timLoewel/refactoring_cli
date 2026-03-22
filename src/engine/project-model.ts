import { Project } from "ts-morph";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { parseIgnoreFile } from "../utils/ignore.js";

export interface LoadProjectOptions {
  path?: string;
  config?: string;
}

export interface ProjectModel {
  project: Project;
  projectRoot: string;
  sourceFiles: string[];
}

function resolveTsConfig(options: LoadProjectOptions): string {
  if (options.config) {
    const configPath = resolve(options.config);
    if (!existsSync(configPath)) {
      throw new Error(`tsconfig not found: ${configPath}`);
    }
    return configPath;
  }

  const dir = options.path ? resolve(options.path) : process.cwd();
  const tsConfigPath = join(dir, "tsconfig.json");

  if (!existsSync(tsConfigPath)) {
    throw new Error(`tsconfig.json not found in ${dir}`);
  }

  return tsConfigPath;
}

const DEFAULT_EXCLUDES = ["**/node_modules/**", "**/dist/**", "**/build/**"];

export function loadProject(options: LoadProjectOptions = {}): ProjectModel {
  const tsConfigPath = resolveTsConfig(options);
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

  return { project, projectRoot, sourceFiles };
}

function matchesGlob(filePath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*");
  return new RegExp(regexStr).test(filePath);
}
