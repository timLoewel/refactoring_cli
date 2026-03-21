function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function validate(input: string): boolean {
  return input.length > 0;
}

export function main(): string {
  const raw = "  Hello World  ";
  const clean = normalize(raw);
  const ok = validate(clean);
  return `clean="${clean}" valid=${ok}`;
}
