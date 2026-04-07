// Functions that are called within the file get their call sites updated
// to use static method syntax after being combined into a class.
export const params = {
  file: "fixture.ts",
  target: "readingBase,taxableCharge",
  className: "Reading",
};

function readingBase(reading: number): number {
  return reading * 0.1;
}

function taxableCharge(reading: number): number {
  return Math.max(0, reading - 100) * 0.2;
}

export function main(): string {
  const charge = readingBase(200) + taxableCharge(200);
  return `Total: ${charge}`;
}
