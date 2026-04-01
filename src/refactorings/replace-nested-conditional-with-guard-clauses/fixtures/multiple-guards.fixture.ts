export const params = { file: "fixture.ts", target: "computeScore" };

function computeScore(value: number): number {
  if (value < 0) {
    return -1;
  } else {
    if (value > 100) {
      return -1;
    } else {
      return value * 2;
    }
  }
}

export function main(): string {
  return `${computeScore(-1)},${computeScore(50)},${computeScore(200)}`;
}
