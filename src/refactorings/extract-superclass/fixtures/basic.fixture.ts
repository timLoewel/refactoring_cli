export function main(): string {
  class Animal {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    speak(): string {
      return `${this.name} makes a sound`;
    }
    describe(): string {
      return `I am ${this.name}`;
    }
  }

  const animal = new Animal("Dog");
  return animal.speak() + " | " + animal.describe();
}
