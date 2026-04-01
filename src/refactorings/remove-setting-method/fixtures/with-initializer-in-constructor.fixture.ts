export const params = { file: "fixture.ts", target: "User", field: "name" };

class User {
  private _name: string;

  constructor(name: string) {
    this._name = name;
  }

  get name(): string {
    return this._name;
  }

  set name(value: string) {
    this._name = value;
  }

  greet(): string {
    return `hello`;
  }
}

export function main(): string {
  const u = new User("Alice");
  return u.greet();
}
