export const params = { file: "fixture.ts", target: "eachPrefix", name: "__reftest__" };

function buildMessage(
  impl: (eachPrefix: string) => string,
  options?: { each?: boolean },
): () => string {
  return (): string => {
    const eachPrefix = options && options.each ? "each value in " : "";
    return impl(eachPrefix);
  };
}

export function main(): string {
  const getMessage = buildMessage((eachPrefix) => eachPrefix + "must be valid", { each: true });
  return getMessage();
}
