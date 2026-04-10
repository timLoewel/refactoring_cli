// Inlining an object literal variable into a function call triggers TypeScript's
// excess property checking. Variables bypass excess checks, but direct object
// literals do not, so inlining introduces a type error.

export const params = {
  file: "fixture.ts",
  target: "opts",
  expectRejection: true,
};

interface Config {
  name: string;
}

function setup(config: Config): string {
  return config.name;
}

export function main(): string {
  const opts = { name: "test", extra: true };
  return setup(opts);
}
