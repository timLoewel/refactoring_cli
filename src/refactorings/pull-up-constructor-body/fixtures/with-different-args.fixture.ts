// Subclass constructor has params but parent has no constructor — known limitation.

export const params = { file: "fixture.ts", target: "Dog", expectRejection: true };

class Animal {
  sound: string = "";
  legs: number = 4;
}

class Dog extends Animal {
  constructor(sound: string) {
    super();
    this.sound = sound;
    this.legs = 4;
  }
}

export function main(): string {
  const dog = new Dog("woof");
  return `${dog.sound} on ${dog.legs} legs`;
}
