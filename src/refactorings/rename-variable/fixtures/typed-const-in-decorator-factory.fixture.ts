export const params = { file: "fixture.ts", target: "args", name: "metadata" };

type Callback = (target: object, key: string) => void;

interface MetaArgs {
  type: string;
  target: Function;
  key: string;
}

function createDecorator(type: string): Callback {
  return function (target: object, key: string): void {
    const args: MetaArgs = {
      type: type,
      target: target.constructor,
      key: key,
    };
    void args;
  };
}

export function main(): string {
  const decorator = createDecorator("test");
  const obj = {};
  decorator(obj, "prop");
  return "ok";
}
