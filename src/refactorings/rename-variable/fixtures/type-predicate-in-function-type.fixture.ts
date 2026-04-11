export const params = { file: "fixture.ts", target: "value", name: "input" };

type Guard = (value: unknown) => value is string;

export function main(): boolean {
  const isString: Guard = (v): v is string => typeof v === "string";
  return isString("hello");
}
