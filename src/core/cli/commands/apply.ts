import { Command } from "commander";
import { getGlobalOptions } from "../context.js";
import { errorOutput, printOutput, successOutput } from "../output.js";
import { loadProject } from "../../project-model.js";
import { registry } from "../../refactoring-registry.js";
import { applyRefactoring } from "../../apply.js";
import { connectOrSpawn } from "../../server/connect.js";
import { frameMessage } from "../../server/framing.js";
import type { ApplyResult } from "../../refactoring.types.js";

function parseKeyValueArgs(args: string[]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const arg of args) {
    const eqIndex = arg.indexOf("=");
    if (eqIndex > 0) {
      params[arg.substring(0, eqIndex)] = arg.substring(eqIndex + 1);
    }
  }
  return params;
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

  const loadResult = loadProject({ path: global.path, config: global.config });
  if (loadResult.isErr()) {
    printOutput(errorOutput("apply", [loadResult.error.message]), isJson);
    process.exitCode = 1;
    return;
  }
  const { project } = loadResult.value;
  const result = applyRefactoring(def, project, params, { dryRun });
  printOutput(successOutput("apply", result), isJson);
  if (!result.success) {
    process.exitCode = 1;
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
      const dryRun = opts.dryRun ?? false;
      const projectRoot = global.path ?? process.cwd();

      // Try daemon first
      const result = await tryDaemonApply(projectRoot, name, params, dryRun);
      if (result) {
        printOutput(successOutput("apply", result), isJson);
        if (!result.success) {
          process.exitCode = 1;
        }
        return;
      }

      // Fallback: in-process apply
      try {
        await inProcessApply(name, params, global, dryRun, isJson);
      } catch (error) {
        printOutput(
          errorOutput("apply", [error instanceof Error ? error.message : String(error)]),
          isJson,
        );
        process.exitCode = 1;
      }
    });
}
