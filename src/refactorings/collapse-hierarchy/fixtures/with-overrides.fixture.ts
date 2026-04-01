// No params: subclass overrides a parent method — collapse-hierarchy copies the member verbatim,
// resulting in a duplicate method implementation in the parent. Known limitation.

class Service {
  describe(): string {
    return "basic service";
  }
}

class PremiumService extends Service {
  describe(): string {
    return "premium service";
  }
  price(): number {
    return 99;
  }
}

export function main(): string {
  const svc = new PremiumService();
  return svc.describe();
}
