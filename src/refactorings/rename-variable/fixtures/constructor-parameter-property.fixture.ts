export const params = { file: "fixture.ts", target: "_weapon", name: "blade" };

class Weapon {
  use(): string {
    return "Used Katana!";
  }
}

class Ninja {
  constructor(private readonly _weapon: Weapon) {}

  fight(): string {
    return this._weapon.use();
  }
}

export function main(): string {
  return new Ninja(new Weapon()).fight();
}
