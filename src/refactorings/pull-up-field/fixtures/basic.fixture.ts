export function main(): string {
  class Animal {
    breathes(): string {
      return "yes";
    }
  }

  class Dog extends Animal {
    name: string;
    constructor(name: string) {
      super();
      this.name = name;
    }
  }

  const dog = new Dog("Rex");
  return `${dog.name} breathes: ${dog.breathes()}`;
}
