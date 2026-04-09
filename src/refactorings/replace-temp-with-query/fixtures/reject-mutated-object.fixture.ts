// A variable that is mutated after initialization (method calls) should not
// be replaced with a query function, because each call would create a fresh
// object without the mutations.

export const params = {
  file: "fixture.ts",
  target: "date",
  name: "getDate",
  expectRejection: true,
};

function formatDate(): string {
  const date = new Date(2024, 0, 15);
  date.setMonth(5);
  date.setDate(20);
  return date.toISOString().slice(0, 10);
}

export function main(): string {
  return formatDate();
}
