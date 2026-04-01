import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../project-model.js";
import { registry } from "../../refactoring-registry.js";
import { applyRefactoring } from "../../apply.js";
import { connectOrSpawn } from "../../server/connect.js";
import { frameMessage } from "../../server/framing.js";
import type { ApplyResult } from "../../refactoring.types.js";

export function parseKeyValueArgs(args: string[]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const arg of args) {
    const eqIndex = arg.indexOf("=");
    if (eqIndex > 0) {
      params[arg.substring(0, eqIndex)] = arg.substring(eqIndex + 1);
    }
  }
  return params;
}

export function detectLanguage(
  params: Record<string, unknown>,
  explicitLang?: string,
): "typescript" | "python" {
  if (explicitLang === "python" || explicitLang === "typescript") {
    return explicitLang;
  }
  const file = params["file"];
  if (typeof file === "string") {
    if (file.endsWith(".py")) return "python";
    if (file.endsWith(".ts") || file.endsWith(".tsx")) return "typescript";
  }
  return "typescript";
}

async function tryDaemonApply(
  projectRoot: string,
  name: string,
  params: Record<string, unknown>,
  dryRun: boolean,
): Promise<ApplyResult | null> {
  try {
    const conn = await connectOrSpawn(projectRoot);
    if (!conn) return null;

    const id = 1;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "apply",
      params: { name, params, dryRun },
    });
    conn.socket.write(frameMessage(body));

    return await new Promise<ApplyResult | null>((resolve) => {
      const handler = (data: Buffer): void => {
        const messages = conn.parser.feed(data.toString("utf-8"));
        for (const msg of messages) {
          conn.socket.removeListener("data", handler);
          conn.socket.end();
          const parsed = JSON.parse(msg) as Record<string, unknown>;
          if (parsed["error"]) {
            resolve(null);
          } else {
            resolve(parsed["result"] as ApplyResult);
          }
          return;
        }
      };
      conn.socket.on("data", handler);
    });
  } catch {
    return null;
  }
}

async function inProcessApply(
  name: string,
  params: Record<string, unknown>,
  lang: "typescript" | "python",
  global: { path?: string; config?: string; json?: boolean },
  dryRun: boolean,
  isJson: boolean,
): Promise<void> {
  const def = registry.lookup(name);
  if (!def) {
    printOutput(errorOutput("apply", [`Unknown refactoring: ${name}`]), isJson);
    process.exitCode = 1;
    return;
  }

  if (lang !== def.language) {
    printOutput(
      errorOutput("apply", [`Refactoring '${name}' is for ${def.language}, but target is ${lang}`]),
      isJson,
    );
    process.exitCode = 1;
    return;
  }

  let teardown: (() => Promise<void>) | null = null;
  if (lang === "python") {
    teardown = await setupPythonContext(global.path ?? process.cwd());
  }

  try {
    const { project } = loadProject({ path: global.path, config: global.config });
    const result = applyRefactoring(def, project, params, { dryRun });
    printOutput(successOutput("apply", result), isJson);
    if (!result.success) {
      process.exitCode = 1;
    }
  } finally {
    if (teardown) {
      await teardown();
    }
  }
}

async function setupPythonContext(projectRoot: string): Promise<(() => Promise<void>) | null> {
  try {
    const { PyrightClient } = await import("../../../python/pyright-client.js");
    const { createPythonParser } = await import("../../../python/tree-sitter-parser.js");
    const { setPythonContext } = await import("../../../python/python-refactoring-builder.js");

    const pyright = new PyrightClient(projectRoot);
    await pyright.ensureReady();
    const parser = createPythonParser();
    setPythonContext({ pyright, parser, projectRoot });

    return async (): Promise<void> => {
      setPythonContext(null);
      await pyright.shutdown();
    };
  } catch {
    return null;
  }
}

export function createApplyCommand(): Command {
  return new Command("apply")
    .description("Apply a refactoring to the target project")
    .argument("<name>", "refactoring name (kebab-case)")
    .option("--dry-run", "preview changes without writing to disk")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async (name: string, opts: { dryRun?: boolean }, cmd: Command) => {
      const global = getGlobalOptions(cmd);
      const isJson = global.json ?? false;
      const params = parseKeyValueArgs(cmd.args.slice(1));
      const lang = detectLanguage(params, global.lang);
      const dryRun = opts.dryRun ?? false;
      const projectRoot = global.path ?? process.cwd();

      // Try daemon first for TypeScript
      if (lang === "typescript") {
        const result = await tryDaemonApply(projectRoot, name, params, dryRun);
        if (result) {
          printOutput(successOutput("apply", result), isJson);
          if (!result.success) {
            process.exitCode = 1;
          }
          return;
        }
      }

      // Fallback: in-process apply
      try {
        await inProcessApply(name, params, lang, global, dryRun, isJson);
      } catch (error) {
        printOutput(
          errorOutput("apply", [error instanceof Error ? error.message : String(error)]),
          isJson,
        );
        process.exitCode = 1;
      }
    });
}
