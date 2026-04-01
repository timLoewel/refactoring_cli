export const params = {
  file: "fixture.ts",
  target: "Printer",
  field: "copies",
  destination: "OfficePrinter",
};

class Printer {
  model: string = "LaserJet";
  copies: number = 1;
}

class OfficePrinter extends Printer {
  department: string = "HR";
  summary(): string {
    return `${this.model} (${this.copies} copies) in ${this.department}`;
  }
}

export function main(): string {
  const p = new OfficePrinter();
  p.copies = 3;
  return p.summary();
}
