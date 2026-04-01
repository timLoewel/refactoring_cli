export const params = { file: "fixture.ts", target: "input", name: "data" };

export function main(): string {
  const process = (input: string): string => input.toUpperCase();
  return process("hello");
}
