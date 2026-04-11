// Regression: an object literal on the RHS of a property assignment gets
// contextual typing from the property's declared type. Extracting it into
// a standalone `const` loses that context, causing implicit-any errors on
// arrow-function parameters and type mismatches.

export const params = {
  file: "fixture.ts",
  target: '{\n      handler: (data) => String(data),\n    }',
  name: "extracted",
  expectRejection: true,
};

interface Config {
  handler: (data: unknown) => string;
}

class Service {
  config: Config;

  constructor() {
    this.config = {
      handler: (data) => String(data),
    };
  }
}

export function main(): string {
  const svc = new Service();
  return svc.config.handler("hello");
}
