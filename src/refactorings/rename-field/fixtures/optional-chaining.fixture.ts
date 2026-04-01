export const params = { file: "fixture.ts", target: "Config", field: "value", name: "setting" };

class Config {
  value: string = "";
}

export function main(): string {
  const config: Config | null = new Config();
  config.value = "active";
  const result = config?.value ?? "default";
  return result;
}
