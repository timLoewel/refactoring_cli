export function main(): string {
  class Vehicle {
    speed: number = 0;
    accelerate(amount: number): void {
      this.speed += amount;
    }
  }

  class Car extends Vehicle {
    // Car adds nothing new — candidate for collapse
  }

  const car = new Car();
  car.accelerate(60);
  return `speed is ${car.speed}`;
}
