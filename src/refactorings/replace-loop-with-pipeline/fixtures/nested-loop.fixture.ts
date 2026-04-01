export const params = { file: "fixture.ts", target: "7" };

export function main(): string {
  const matrix = [[1, 2], [3, 4]];
  const processed: string[] = [];
  for (const row of matrix) {
    for (const cell of row) {
      const doubled = cell * 2;
      processed.push(String(doubled));
    }
  }
  return processed.join(",");
}
