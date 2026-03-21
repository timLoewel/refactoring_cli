import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../engine/project-model.js";
import type { Diagnostic } from "ts-morph";
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
        const diagnostics = project.getPreEmitDiagnostics();
        const broken = findBrokenImports(diagnostics);

        if (opts.list || !opts.auto) {
          printOutput(successOutput("fix-imports", { broken, fixed: [] }), isJson);
          return;
        }

        // Auto-fix: organize imports on files with broken imports
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
