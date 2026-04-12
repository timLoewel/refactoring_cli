export const params = { file: "fixture.ts", target: "combine", name: "merge" };

const combine = <T extends Record<string, unknown>>(a: T, b: T): T =>
  Object.assign({} as T, a, b);

function buildConfig(base: Record<string, unknown>, overrides: Record<string, unknown>): string {
  const merged = combine(base, overrides);
  return JSON.stringify(merged);
}

export function main(): string {
  return buildConfig({ host: "localhost" }, { port: "3000" });
}
