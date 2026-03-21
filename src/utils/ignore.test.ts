import { parseIgnoreFile } from "./ignore.js";

describe("parseIgnoreFile", () => {
  it("parses lines from ignore file content", () => {
    const content = "*.generated.ts\nsrc/legacy/**\n";
    expect(parseIgnoreFile(content)).toEqual(["*.generated.ts", "src/legacy/**"]);
  });

  it("skips comments and empty lines", () => {
    const content = "# This is a comment\n\npattern1\n  \n# Another comment\npattern2\n";
    expect(parseIgnoreFile(content)).toEqual(["pattern1", "pattern2"]);
  });

  it("returns empty array for empty content", () => {
    expect(parseIgnoreFile("")).toEqual([]);
  });
});
