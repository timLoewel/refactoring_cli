export function main(): string {
  class Person {
    name: string;
    age: number;
    constructor(name: string, age: number) {
      this.name = name;
      this.age = age;
    }
    greet(): string {
      return `Hi, I'm ${this.name}, age ${this.age}`;
    }
  }

  const person = new Person("Alice", 30);
  return person.greet();
}
