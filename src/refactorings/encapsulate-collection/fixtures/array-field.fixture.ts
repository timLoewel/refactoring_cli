export const params = { file: "fixture.ts", target: "Library", field: "books" };

class Library {
  name: string = "City Library";
  books: string[] = [];

  getName(): string {
    return this.name;
  }
}

export function main(): string {
  const lib = new Library();
  return lib.getName();
}
