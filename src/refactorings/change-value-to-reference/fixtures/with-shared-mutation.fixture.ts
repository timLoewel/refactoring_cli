export const params = { file: "fixture.ts", target: "Country" };

class Country {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

export function main(): string {
  const c = new Country("France");
  return c.name;
}
