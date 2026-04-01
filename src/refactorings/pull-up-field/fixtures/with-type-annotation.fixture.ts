export const params = {
  file: "fixture.ts",
  target: "Cat",
  field: "name",
};

class Animal {
  sound: string = "generic";
}

class Cat extends Animal {
  name: string = "Whiskers";
}

export function main(): string {
  const cat = new Cat();
  return `${cat.name} says ${cat.sound}`;
}
