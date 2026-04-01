export const params = {
  file: "fixture.ts",
  target: "processName",
  condition: "name !== null",
};

function processName(name: string | null): string {
  return name ?? "";
}

export function main(): string {
  return processName("Alice");
}
