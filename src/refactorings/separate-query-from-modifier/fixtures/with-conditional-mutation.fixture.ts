export const params = { file: "fixture.ts", target: "fetchValue" };

const log: string[] = [];
let cached = false;

function fetchValue(key: string): string {
  if (!cached) {
    log.push(`fetching:${key}`);
    cached = true;
  }
  return `value-${key}`;
}

export function main(): string {
  log.length = 0;
  cached = false;
  const a = fetchValue("x");
  const b = fetchValue("x");
  return `${a},${b},log=${log.join(",")}`;
}
