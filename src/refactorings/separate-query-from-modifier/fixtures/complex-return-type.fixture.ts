export const params = { file: "fixture.ts", target: "fetchAndCache" };

const cache: Map<string, { value: number; timestamp: number }> = new Map();

function fetchAndCache(key: string, value: number): { value: number; timestamp: number } {
  const entry = { value, timestamp: Date.now() };
  cache.set(key, entry);
  return entry;
}

export function main(): string {
  cache.clear();
  const result = fetchAndCache("test", 42);
  return `value: ${result.value}, cached: ${cache.has("test")}`;
}
