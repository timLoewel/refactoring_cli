export const params = { file: "fixture.ts", target: "5" };

export function main(): string {
  const value = 100;
  if (value > 50) {
    console.log("large");
  } else {
    console.log("small");
  }
  return String(value);
}
