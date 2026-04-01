export const params = {
  file: "fixture.ts",
  startLine: 13,
  endLine: 14,
  name: "logDetails",
};

const messages: string[] = [];

export function main(): string {
  const name = "Alice";
  const age = 30;
  messages.push(`Name: ${name}`);
  messages.push(`Age: ${age}`);
  return messages.join(", ");
}
