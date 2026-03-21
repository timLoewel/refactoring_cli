export function main(): string {
  class Animal {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    bark(): string {
      return `${this.name} barks`;
    }
  }

  class Dog extends Animal {
    breed: string;
    constructor(name: string, breed: string) {
      super(name);
      this.breed = breed;
    }
  }

  const dog = new Dog("Rex", "Labrador");
  return dog.bark();
}
