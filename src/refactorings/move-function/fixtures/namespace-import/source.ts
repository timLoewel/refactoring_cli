import * as utils from "./utils.js";

export function process(input: string): string {
  const num = utils.parse(input);
  return utils.format(num * 2);
}
