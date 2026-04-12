export const params = { file: "fixture.ts", target: "value", name: "renamed" };

export function main(): string {
  // Enum member names are identifiers but should not be renamed when a
  // local variable with the same name is renamed. This mirrors the JSX
  // attribute-name bug: <Provider scope={scope}> must not rename the
  // attribute name "scope", only the value reference.
  const value = "hello";
  enum Config {
    value = "world",
  }
  return value + Config.value;
}
