export const params = { file: "fixture.ts", target: "updateScore" };

const events: string[] = [];

function updateScore(player: string, delta: number): number {
  events.push(`${player}+${delta}`);
  return delta * 10;
}

export function main(): string {
  events.length = 0;
  const result = updateScore("alice", 3);
  return `${result}:${events.join(",")}`;
}
