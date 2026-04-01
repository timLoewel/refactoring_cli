// Verify that the generated Command class has an execute() method.
// main() is independent of the function being refactored.
export const params = {
  file: "fixture.ts",
  target: "computeDiscount",
  className: "ComputeDiscountCommand",
};

function computeDiscount(price: number, rate: number): number {
  return price * rate;
}

export function main(): string {
  return "verify-execute-ready";
}
