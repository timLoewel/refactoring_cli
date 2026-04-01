export const params = {
  file: "fixture.ts",
  target: "normalize",
};

interface Record {
  value: string;
}

function normalize(rec: Record): void {
  rec.value = rec.value.trim().toLowerCase();
}

export function main(): string {
  let rec: Record = { value: "  Hello World  " };
  normalize(rec);
  return rec.value;
}
