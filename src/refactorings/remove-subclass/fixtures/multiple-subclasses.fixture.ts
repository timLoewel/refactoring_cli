export const params = {
  file: "fixture.ts",
  target: "GoldMember",
};

class Member {
  name: string = "";
}

class GoldMember extends Member {
  discount(): number {
    return 20;
  }
}

class SilverMember extends Member {
  discount(): number {
    return 10;
  }
}

export function main(): string {
  const base = new Member();
  base.name = "Alice";
  const silver = new SilverMember();
  silver.name = "Bob";
  return `${base.name} base | ${silver.name} silver ${silver.discount()}%`;
}
