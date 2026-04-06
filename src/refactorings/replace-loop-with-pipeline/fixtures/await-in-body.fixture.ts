// No params: loop body contains await — precondition error (forEach callback cannot be async)

async function save(item: string): Promise<void> {
  // simulate async save
}

export async function main(): Promise<string> {
  const items = ["a", "b", "c"];
  for (const item of items) {
    await save(item);
  }
  return items.join(",");
}
