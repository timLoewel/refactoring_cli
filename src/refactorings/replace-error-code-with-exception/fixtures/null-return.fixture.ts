// Function uses negative returns as error codes; success path is implicit.
// The implementation replaces negative returns with throws and sets return type to void.
export const params = { file: "fixture.ts", target: "writeData" };

const output: string[] = [];

function writeData(data: string) {
  if (data.length === 0) return -1;
  if (data.length > 100) return -2;
  output.push(data);
}

export function main(): string {
  output.length = 0;
  writeData("hello");
  return output.join(",");
}
