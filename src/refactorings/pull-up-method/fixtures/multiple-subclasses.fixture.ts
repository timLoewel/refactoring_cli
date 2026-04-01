export const params = {
  file: "fixture.ts",
  target: "Sedan",
  method: "fuelType",
};

class Car {
  model: string = "base";
}

class Sedan extends Car {
  fuelType(): string {
    return "gasoline";
  }
}

class Truck extends Car {
  payload(): number {
    return 2000;
  }
}

export function main(): string {
  const s = new Sedan();
  s.model = "Camry";
  return `${s.model} runs on ${s.fuelType()}`;
}
