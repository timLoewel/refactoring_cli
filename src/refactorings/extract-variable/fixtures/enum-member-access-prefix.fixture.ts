// Regression: extracting `Ns.Kind` when it appears as a prefix of longer
// property accesses like `Ns.Kind.A`, `Ns.Kind.B` etc. should only replace
// the prefix part, leaving `extracted.A`, `extracted.B` — not replacing the
// entire outer expression.
export const params = { file: "fixture.ts", target: "Ns.Kind", name: "extracted" };

const Ns = {
  Kind: {
    A: "a" as const,
    B: "b" as const,
    C: "c" as const,
  },
};

export function main(): string {
  const values: string[] = ["a", "b", "c"];
  const results: string[] = [];
  for (const v of values) {
    switch (v) {
      case Ns.Kind.A:
        results.push("alpha");
        break;
      case Ns.Kind.B:
        results.push("beta");
        break;
      case Ns.Kind.C:
        results.push("gamma");
        break;
    }
  }
  return results.join(",");
}
