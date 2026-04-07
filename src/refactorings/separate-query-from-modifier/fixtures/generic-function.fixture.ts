export const params = { file: "fixture.ts", target: "transform" };

let sideEffectLog: string[] = [];

function transform<T extends string>(input: T): T {
  sideEffectLog.push(input);
  return input.toUpperCase() as T;
}

export function main(): string {
  sideEffectLog = [];
  const result = transform("hello");
  return `${result}, log: ${sideEffectLog.join(",")}`;
}
