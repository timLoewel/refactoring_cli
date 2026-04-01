export const params = {
  file: "fixture.ts",
  target: "Config",
  field: "timeout",
  destination: "ServerConfig",
};

class Config {
  host: string = "localhost";
  timeout: number = 30;
}

class ServerConfig extends Config {
  port: number = 8080;
}

export function main(): string {
  const cfg = new ServerConfig();
  return `host=${cfg.host} port=${cfg.port} timeout=${cfg.timeout}`;
}
