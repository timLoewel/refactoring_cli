// Loop body contains await — precondition error (forEach callback cannot be async).

export const params = { file: "fixture.ts", target: "11", expectRejection: true };

async function save(item: string): Promise<void> {
  // simulate async save
}

async function run(): Promise<string> {
  const items = ["a", "b", "c"];
  for (const item of items) {
    await save(item);
  }
  return items.join(",");
}

export function main(): string {
  return "a,b,c";
}
