export const params = { file: "fixture.ts", target: "message", name: "msg" };

type ErrMessage = string | { message?: string };

export function main(): string {
  const errToObj = (message?: ErrMessage) =>
    typeof message === "string" ? { message } : message || {};
  const result = errToObj("hello");
  return (result as { message: string }).message;
}
