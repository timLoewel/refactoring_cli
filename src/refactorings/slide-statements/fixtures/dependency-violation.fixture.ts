// No params: dependency-violation — the refactoring has no data-flow analysis.
// Moving a statement past a dependency (e.g., sliding `const b = a + 1` before
// `const a = 1`) causes a runtime error. Callers are responsible for ensuring
// the slide is semantically safe.

const a = 1;
const b = a + 1;
const c = a + b;

export function main(): string {
  return String(c);
}
