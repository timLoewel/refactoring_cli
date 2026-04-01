// Verify callers capture the return value after refactoring.
// After: `myScore = updateScore(myScore, 5)` instead of `updateScore(myScore, 5)`.
export const params = {
  file: "fixture.ts",
  target: "updateScore",
};

interface Score {
  value: number;
}

function updateScore(score: Score, delta: number): void {
  score.value += delta;
}

export function main(): string {
  let myScore: Score = { value: 0 };
  updateScore(myScore, 10);
  updateScore(myScore, 5);
  return String(myScore.value);
}
