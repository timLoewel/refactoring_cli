export const params = { file: "fixture.ts", target: "6" };

const flags: string[] = [];

const score = 85;
if (score >= 60 && score <= 100) {
  flags.push("pass");
} else {
  flags.push("fail");
}

export function main(): string {
  return flags[0] ?? "";
}
