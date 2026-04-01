export const params = { file: "fixture.ts", target: "running" };

export function main(): string {
  const items = ["a", "b", "stop", "c"];
  let result = "";
  let running = true;
  let i = 0;
  while (running) {
    const item = items[i];
    if (item === "stop") {
      running = false;
    } else {
      result += item;
      i++;
    }
  }
  return result;
}
