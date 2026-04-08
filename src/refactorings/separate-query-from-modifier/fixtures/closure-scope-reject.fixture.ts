// Nested function captures closure scope — precondition should reject.

export const params = { file: "fixture.ts", target: "fetchAndStore", expectRejection: true };

const results: string[] = [];

function setup(): string {
  const dataSource = "db-connection";

  function fetchAndStore(): string {
    results.push(dataSource);
    return dataSource;
  }

  return fetchAndStore();
}

export function main(): string {
  results.length = 0;
  return setup();
}
