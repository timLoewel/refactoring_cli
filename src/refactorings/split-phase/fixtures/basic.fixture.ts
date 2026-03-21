function processData(input: string): string {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  const tagged = `[${upper}]`;
  return tagged;
}

export function main(): string {
  return processData("  hello world  ");
}
