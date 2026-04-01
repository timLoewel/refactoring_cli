export const params = { file: "fixture.ts", target: "Token" };

class Token {
  readonly kind: string = "id";
  value: string = "";

  describe(): string {
    return "token";
  }
}

export function main(): string {
  const t = new Token();
  return t.describe();
}
