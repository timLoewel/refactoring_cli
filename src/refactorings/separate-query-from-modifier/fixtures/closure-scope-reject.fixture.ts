// No params: function references 'dataSource' from enclosing describe() scope.
// Extracting to top-level would lose access to that variable.
// Precondition should reject with a clear error message.

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
