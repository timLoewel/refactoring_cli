// Regression: extracting a multi-line array literal from a property value
// with `as const` at module level, where the object has properties after the target.
// The `as const` must move to the declaration, not stay on the reference.

export const params = {
  file: "fixture.ts",
  target: `[\n    "jan.",\n    "feb.",\n    "mars",\n    "apríl",\n    "maí",\n    "júní",\n    "júlí",\n    "ágúst",\n    "sept.",\n    "okt.",\n    "nóv.",\n    "des.",\n  ]`,
  name: "extracted",
};

const monthValues = {
  narrow: ["J", "F", "M", "A", "M", "J", "J", "Á", "S", "Ó", "N", "D"] as const,
  abbreviated: [
    "jan.",
    "feb.",
    "mars",
    "apríl",
    "maí",
    "júní",
    "júlí",
    "ágúst",
    "sept.",
    "okt.",
    "nóv.",
    "des.",
  ] as const,
  wide: [
    "janúar",
    "febrúar",
    "mars",
    "apríl",
    "maí",
    "júní",
    "júlí",
    "ágúst",
    "september",
    "október",
    "nóvember",
    "desember",
  ] as const,
};

export function main() {
  return monthValues.abbreviated[0];
}
