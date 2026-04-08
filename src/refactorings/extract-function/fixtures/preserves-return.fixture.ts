// When extracted statements contain a return, the call site must also return.

export const params = {
  file: "fixture.ts",
  startLine: 12,
  endLine: 13,
  name: "formatSign",
};

function format(offset: number): string {
  if (offset > 0) {
    const sign = offset > 10 ? "++" : "+";
    return sign + String(offset);
  }
  return "-" + String(-offset);
}

export function main(): string {
  return format(5) + "," + format(15) + "," + format(-3);
}
