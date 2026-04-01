export const params = {
  file: "fixture.ts",
  target: "Vehicle",
  field: "chargeLevel",
  subclass: "ElectricCar",
};

class Vehicle {
  speed: number = 0;
  chargeLevel: number = 100;
}

class ElectricCar extends Vehicle {
  describe(): string {
    return `speed=${this.speed} charge=${this.chargeLevel}`;
  }
}

export function main(): string {
  const car = new ElectricCar();
  return car.describe();
}
