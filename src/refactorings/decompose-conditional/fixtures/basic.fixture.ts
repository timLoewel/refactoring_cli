export function main(): string {
  const age = 20;
  const hasLicense = true;
  if (age >= 18 && hasLicense) {
    return "allowed to drive";
  } else {
    return "not allowed to drive";
  }
}
