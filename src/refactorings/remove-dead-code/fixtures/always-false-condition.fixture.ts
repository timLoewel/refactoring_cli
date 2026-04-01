// Dead variable (never referenced) is removed; main() behavior is unchanged.
export const params = { file: "fixture.ts", target: "deadFlag" };

const deadFlag = false;

export function main(): string {
  return "running";
}
