export const params = { file: "fixture.ts", target: "transform" };

const transform = function (x: number): number {
  return x * 10;
};

export function main(): string {
  return String(transform(5));
}
