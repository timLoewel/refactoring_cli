export const params = {
  file: "fixture.ts",
  target: "RewardsMember",
  delegateClassName: "RewardsDelegate",
};

class Member {}

class RewardsMember extends Member {
  points: number = 0;
  tier(): string {
    return "gold";
  }
  perks(): string {
    return "lounge access";
  }
}

export function main(): string {
  const m = new RewardsMember();
  m.points = 150;
  return `points=${m.points} tier=${String(m.tier())} perks=${String(m.perks())}`;
}
