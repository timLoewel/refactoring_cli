export const params = {
  file: "fixture.ts",
  target: "Vehicle",
  typeField: "kind",
};

class Vehicle {
  model: string = "X1";
  kind: string = "sedan";
  describe(): string {
    return `model=${this.model}`;
  }
}

export function main(): string {
  const v = new Vehicle();
  return v.describe();
}
