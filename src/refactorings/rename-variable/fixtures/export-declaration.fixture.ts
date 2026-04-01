export const params = { file: "fixture.ts", target: "version", name: "appVersion" };

export const version = "1.0";

export function main(): string {
  return `v${version}`;
}
