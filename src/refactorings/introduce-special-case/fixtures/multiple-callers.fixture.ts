export const params = {
  file: "fixture.ts",
  target: "Account",
  specialValue: "closed",
  specialClassName: "ClosedAccount",
};

class Account {
  status: string;
  constructor(status: string) {
    this.status = status;
  }
  getStatus(): string {
    return this.status;
  }
  getBalance(): number {
    return 100;
  }
}

function summarise(a: Account): string {
  return `${a.getStatus()}:${a.getBalance()}`;
}

export function main(): string {
  const a = new Account("active");
  return summarise(a);
}
