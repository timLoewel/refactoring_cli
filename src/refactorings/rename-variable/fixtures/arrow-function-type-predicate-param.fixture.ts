export const params = { file: "fixture.ts", target: "val", name: "__reftest__" };

export function main(): boolean {
  type AnyConstructor = abstract new (...args: any[]) => any;

  function isInstanceOf<T extends AnyConstructor>(classConstructor: T) {
    return (val: unknown): val is InstanceType<T> => val instanceof classConstructor;
  }

  return isInstanceOf(String)("hello");
}
