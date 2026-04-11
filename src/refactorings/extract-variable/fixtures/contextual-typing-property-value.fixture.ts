// Regression: an arrow function used as a property value inside an object literal
// gets contextual typing from the property's expected type. Extracting it into a
// standalone `const` loses that context, causing "Parameter implicitly has an 'any' type".

export const params = {
  file: "fixture.ts",
  target: '(data) => String(data)',
  name: "extracted",
  expectRejection: true,
};

interface StandardSchema {
  version: number;
  vendor: string;
  validate: (data: unknown) => string;
}

class Schema {
  standard: StandardSchema;

  constructor() {
    this.standard = {
      version: 1,
      vendor: "test",
      validate: (data) => String(data),
    };
  }
}

export function main(): string {
  const s = new Schema();
  return s.standard.validate("hello");
}
