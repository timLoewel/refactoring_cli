export const params = {
  file: "fixture.ts",
  target: "Dog",
  field: "name",
};

class Animal {
  breathes(): string {
    return "yes";
  }
}

class Dog extends Animal {
  name: string = "";
  constructor(name: string) {
    super();
    this.name = name;
  }
}

export function main(): string {
  const dog = new Dog("Rex");
  return `${dog.name} breathes: ${dog.breathes()}`;
}
