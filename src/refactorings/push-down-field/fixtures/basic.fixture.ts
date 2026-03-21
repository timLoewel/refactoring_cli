export function main(): string {
  class Vehicle {
    speed: number = 0;
    fuelType: string = "gasoline";
  }

  class ElectricCar extends Vehicle {
    charge(): string {
      return "charging...";
    }
  }

  const car = new ElectricCar();
  return `Speed: ${car.speed}, fuel: ${car.fuelType}`;
}
