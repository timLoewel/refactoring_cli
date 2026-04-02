import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

const PORTFILE_NAME = ".refactoring-server";

export interface PortfileData {
  port: number;
  token: string;
}

export function portfilePath(projectRoot: string): string {
  return join(projectRoot, PORTFILE_NAME);
}

export function write(projectRoot: string, port: number, token: string): void {
  writeFileSync(portfilePath(projectRoot), `${port} ${token}`);
}

export function read(projectRoot: string): PortfileData | null {
  const p = portfilePath(projectRoot);
  if (!existsSync(p)) return null;
  const parts = readFileSync(p, "utf-8").trim().split(" ");
  if (parts.length !== 2) return null;
  const port = Number(parts[0]);
  if (!Number.isInteger(port) || port <= 0) return null;
  return { port, token: parts[1] as string };
}

export function unlink(projectRoot: string): void {
  if (existsSync(portfilePath(projectRoot))) unlinkSync(portfilePath(projectRoot));
}
