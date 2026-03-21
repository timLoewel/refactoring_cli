export function main(): string {
  const score = calculateScore(10, 3);
  return `Score: ${score}`;
}

function calculateScore(base: number, multiplier: number): number {
  return base * multiplier;
}
