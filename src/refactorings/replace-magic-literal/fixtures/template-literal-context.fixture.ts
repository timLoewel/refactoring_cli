// String literal used in template context; gets extracted to named const.
export const params = { file: "fixture.ts", target: '"api"', name: "API_NAME" };

export function main(): string {
  const name = "api";
  return `service:${name}`;
}
