import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../project-model.js";
import type { Diagnostic, Project } from "ts-morph";
import { DiagnosticCategory } from "ts-morph";

interface BrokenImport {
  filePath: string;
  line: number;
  message: string;
}

function findBrokenImports(diagnostics: Diagnostic[]): BrokenImport[] {
  const importErrors = diagnostics.filter((d) => {
    const code = d.getCode();
    // TS2305: module has no exported member, TS2307: cannot find module
    return d.getCategory() === DiagnosticCategory.Error && (code === 2305 || code === 2307);
  });

  return importErrors.map((d) => {
    const sf = d.getSourceFile();
    const start = d.getStart();
    const line = sf && start !== undefined ? sf.getLineAndColumnAtPos(start).line : 0;
    return {
      filePath: sf?.getFilePath() ?? "unknown",
      line,
      message: d.getMessageText().toString(),
    };
  });
}

function autoFixImports(project: Project, broken: BrokenImport[]): string[] {
  const filePaths = [...new Set(broken.map((b) => b.filePath))];
  const fixed: string[] = [];
  for (const filePath of filePaths) {
    const sf = project.getSourceFile(filePath);
    if (sf) {
      sf.organizeImports();
      fixed.push(filePath);
    }
  }
  project.saveSync();
  return fixed;
}

export function createFixImportsCommand(): Command {
  return new Command("fix-imports")
    .description("Detect and fix broken imports")
    .option("--list", "list broken imports without fixing")
    .option("--auto", "automatically fix broken imports")
    .action((opts: { list?: boolean; auto?: boolean }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;

      try {
        const { project } = loadProject({ path: global.path, config: global.config });
        const broken = findBrokenImports(project.getPreEmitDiagnostics());

        if (opts.list || !opts.auto) {
          printOutput(successOutput("fix-imports", { broken, fixed: [] }), isJson);
          return;
        }

        const fixed = autoFixImports(project, broken);
        printOutput(successOutput("fix-imports", { broken, fixed }), isJson);
      } catch (error) {
        printOutput(
          errorOutput("fix-imports", [error instanceof Error ? error.message : String(error)]),
          isJson,
        );
        process.exitCode = 1;
      }
    });
}
