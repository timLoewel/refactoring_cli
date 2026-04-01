export const params = {
  file: "fixture.ts",
  target: "SportsCar",
};

class Car {
  speed: number = 0;
  accelerate(amount: number): void {
    this.speed += amount;
  }
}

class SportsCar extends Car {
  turboBoost(): string {
    return "BOOST";
  }
}

export function main(): string {
  const car = new Car();
  car.accelerate(100);
  return `speed at ${car.speed}`;
}
