// Return type expects string but variable becomes Label — type mismatch.
export const params = {
  file: "fixture.ts",
  target: "label",
  className: "Label",
  expectRejection: true,
};

const label: string = "hello";

export function main(): string {
  return label;
}
