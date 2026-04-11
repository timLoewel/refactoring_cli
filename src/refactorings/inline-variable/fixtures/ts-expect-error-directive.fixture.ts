export const params = { file: "fixture.ts", target: "result", expectRejection: true };

interface Strict {
  name: string;
}

declare function create(opts: Strict): Strict;

export function main(): string {
  // @ts-expect-error passing unknown property intentionally
  const result = create({ name: "bob", extra: true });
  return result.name;
}
