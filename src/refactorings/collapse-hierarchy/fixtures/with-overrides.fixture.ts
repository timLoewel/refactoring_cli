// Subclass overrides a parent method — duplicate method after collapse. Known limitation.

export const params = { file: "fixture.ts", target: "PremiumService", expectRejection: true };

class Service {
  describe(): string {
    return "basic service";
  }
}

class PremiumService extends Service {
  override describe(): string {
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
