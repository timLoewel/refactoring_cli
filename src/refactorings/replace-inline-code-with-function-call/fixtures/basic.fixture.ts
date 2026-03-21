function isEligible(age: number): boolean {
  return age >= 18;
}

export function main(): string {
  const userAge = 21;
  const eligible = userAge >= 18;
  const result = eligible ? "yes" : "no";
  return `eligible: ${result}`;
}
