export const params = { file: "fixture.ts", target: "opts", expectRejection: true };

export function main(args: { local?: boolean; offset?: boolean }): string {
  let regex = "base";

  const opts: string[] = [];
  opts.push(args.local ? "Z?" : "Z");
  if (args.offset) opts.push("offset");
  regex = `${regex}(${opts.join("|")})`;
  return regex;
}
