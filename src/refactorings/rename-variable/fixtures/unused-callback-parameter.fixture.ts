export const params = { file: "fixture.ts", target: "args", name: "__reftest__" };

export function main(): boolean {
  const isDate = (value: unknown): boolean => value instanceof Date;
  const validate = (value: unknown, args: unknown): boolean => isDate(value);
  return validate(new Date(), {});
}
