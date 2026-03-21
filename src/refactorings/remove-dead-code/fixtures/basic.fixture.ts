function formatGreeting(name: string): string {
  return `Hello, ${name}!`;
}

function unusedHelper(x: number): number {
  return x * x;
}

export function main(): string {
  return formatGreeting("world");
}
