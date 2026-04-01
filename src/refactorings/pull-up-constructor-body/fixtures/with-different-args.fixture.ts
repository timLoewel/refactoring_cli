// No params: subclass constructor has parameters but parent has no constructor —
// the implementation creates a malformed constructor parameter when joining param texts as a
// single string. Known limitation: use pull-up-constructor-body only when parent already has
// a constructor or when the subclass constructor takes no arguments.

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
