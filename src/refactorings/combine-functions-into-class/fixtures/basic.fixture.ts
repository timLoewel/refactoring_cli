function readingBase(reading: number): number {
  return reading * 0.1;
}

function taxableCharge(reading: number): number {
  return Math.max(0, reading - 100) * 0.2;
}

function calculateCharge(reading: number): number {
  return readingBase(reading) + taxableCharge(reading);
}

export function main(): string {
  const charge = calculateCharge(200);
  return `Total charge: ${charge}`;
}
