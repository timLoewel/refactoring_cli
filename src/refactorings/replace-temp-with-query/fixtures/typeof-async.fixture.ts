// An async temp used in a `typeof` query. The query function returns a Promise,
// so `typeof result` must become `Awaited<ReturnType<typeof fn>>`, not
// `ReturnType<typeof fn>` (which would be the Promise, not the awaited value).

export const params = { file: "fixture.ts", target: "result", name: "fetchResult" };

async function fetchValue(): Promise<number> {
  return 7;
}

export async function main(): Promise<string> {
  const result = await fetchValue();
  type R = typeof result;
  const echoed: R = result;
  return String(echoed);
}
