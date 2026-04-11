export const params = { file: "fixture.ts", target: "selections", name: "picked" };

type FindSelected<V, P> = V extends P ? V : never;

type MatchWith<V> = {
  handler: (
    selections: FindSelected<V, string>,
    value: V
  ) => string;
};

export function main(): string {
  const match: MatchWith<string> = {
    handler: (s, v) => s + "-" + v,
  };
  return match.handler("hello", "world");
}
