export const params = {
  file: "fixture.ts",
  target: "createUser",
  params: "name,age,email",
  objectName: "opts",
};

export function main(): string {
  const result = createUser("Alice", 30, "alice@example.com");
  return result;
}

function createUser(name: string, age: number, email: string): string {
  return `${name} (${age}) - ${email}`;
}
