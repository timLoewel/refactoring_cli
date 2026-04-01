export const params = { file: "fixture.ts", target: "config", name: "settings" };

export function main(): string {
  const config = { debug: true, version: 1 };
  type Config = typeof config;
  const copy: Config = { ...config };
  return String(copy.debug);
}
