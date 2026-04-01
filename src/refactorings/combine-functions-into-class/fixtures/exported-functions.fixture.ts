// Exported functions get combined into an exported class.
export const params = {
  file: "fixture.ts",
  target: "formatName,formatTitle",
  className: "Formatter",
};

export function formatName(first: string, last: string): string {
  return `${first} ${last}`;
}

export function formatTitle(title: string, name: string): string {
  return `${title} ${name}`;
}

export function main(): string {
  return "formatter-ready";
}
