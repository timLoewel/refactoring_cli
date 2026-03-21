import { successOutput, errorOutput } from "./output.js";

describe("CLI Output", () => {
  it("creates success output", () => {
    const output = successOutput("test", { value: 1 });
    expect(output.success).toBe(true);
    expect(output.command).toBe("test");
    expect(output.data).toEqual({ value: 1 });
  });

  it("creates error output", () => {
    const output = errorOutput("test", ["something went wrong"]);
    expect(output.success).toBe(false);
    expect(output.data).toBeNull();
    expect(output.errors).toEqual(["something went wrong"]);
  });
});
