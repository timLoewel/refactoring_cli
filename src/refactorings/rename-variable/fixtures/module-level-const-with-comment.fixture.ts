export const params = { file: "fixture.ts", target: "ipv6Regex", name: "ipPattern" };

// const ipv6Regex = /old-pattern/;
const ipv6Regex =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3})$/;

function isValidIPv6(ip: string): boolean {
  return ipv6Regex.test(ip);
}

export function main(): string {
  return isValidIPv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334") ? "valid" : "invalid";
}
