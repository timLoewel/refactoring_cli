export const params = {
  file: "fixture.ts",
  target: "Vehicle",
  field: "fuelType",
  subclass: "ElectricCar",
};

class Vehicle {
  speed: number = 0;
  fuelType: string = "gasoline";
}

class ElectricCar extends Vehicle {
  charge(): string {
    return "charging...";
  }
}

export function main(): string {
  const car = new ElectricCar();
  return `Speed: ${car.speed}, fuel: ${car.fuelType}`;
}
