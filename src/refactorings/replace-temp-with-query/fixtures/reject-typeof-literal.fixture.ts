// A temp with an un-annotated literal type, used in a `typeof` query. Routing it
// through a query function widens the type ("active" -> string), which would
// silently change the meaning of the `typeof` assertion, so it is rejected.

export const params = {
  file: "fixture.ts",
  target: "label",
  name: "getLabel",
  expectRejection: true,
};

export function main(): string {
  const label = "active";
  type L = typeof label;
  const echoed: L = label;
  return echoed;
}
