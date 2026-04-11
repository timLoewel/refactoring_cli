export const params = { file: "fixture.ts", target: "result", expectRejection: true };

export function main(x: number): string {
  let result = "initial";
  if (x > 0) {
    result = result + " positive";
  }
  return result;
}
