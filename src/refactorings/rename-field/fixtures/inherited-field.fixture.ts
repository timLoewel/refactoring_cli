export const params = { file: "fixture.ts", target: "Animal", field: "name", name: "species" };

class Animal {
  name: string = "";
}

class Dog extends Animal {
  breed: string = "";
}

export function main(): string {
  const d = new Dog();
  d.name = "Labrador";
  d.breed = "Lab";
  return `${d.name} (${d.breed})`;
}
