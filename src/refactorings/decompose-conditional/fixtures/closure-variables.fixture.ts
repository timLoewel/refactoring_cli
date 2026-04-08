// Branch contains return statement — precondition error (cannot safely extract).

export const params = { file: "fixture.ts", target: "8", expectRejection: true };

export function main(): string {
  const threshold = 10;
  const value = 15;
  if (value > threshold) {
    return String(value - threshold);
  }
  return "0";
}
