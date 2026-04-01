// Some params have default values; grouped params include only named ones.
export const params = {
  file: "fixture.ts",
  target: "formatText",
  params: "text,size",
  objectName: "options",
};

function formatText(text: string, size: number, bold: boolean): string {
  return bold ? `**${text}**` : text;
}

export function main(): string {
  return "with-defaults-ready";
}
