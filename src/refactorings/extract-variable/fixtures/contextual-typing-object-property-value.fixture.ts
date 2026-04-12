// Regression: an object literal used as a property value inside an object literal
// gets contextual typing from the property's expected type. Extracting it into
// a standalone `const` loses that context, causing type mismatch errors.

export const params = {
  file: "fixture.ts",
  target: "{\n    weekStartsOn: 0,\n    firstWeekContainsDate: 1,\n  }",
  name: "options",
  expectRejection: true,
};

interface LocaleOptions {
  weekStartsOn: number;
  firstWeekContainsDate: number;
}

interface Locale {
  code: string;
  options: LocaleOptions;
}

export const ja: Locale = {
  code: "ja",
  options: {
    weekStartsOn: 0,
    firstWeekContainsDate: 1,
  },
};

export function main(): number {
  return ja.options.weekStartsOn;
}
