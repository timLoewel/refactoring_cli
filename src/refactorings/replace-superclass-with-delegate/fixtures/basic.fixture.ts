export function main(): string {
  class List {
    private items: string[] = [];
    add(item: string): void {
      this.items.push(item);
    }
    count(): number {
      return this.items.length;
    }
  }

  class Stack extends List {
    description(): string {
      return `Stack with ${this.count()} items`;
    }
  }

  const stack = new Stack();
  stack.add("one");
  stack.add("two");
  return stack.description();
}
