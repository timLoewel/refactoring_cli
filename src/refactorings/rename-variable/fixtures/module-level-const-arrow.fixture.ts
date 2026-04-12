export const params = { file: "fixture.ts", target: "hasFullICU", name: "checkICU" };

const hasFullICU = (): boolean => {
  try {
    const january = new Date(9e8);
    const spanish = new Intl.DateTimeFormat("es", { month: "long" });
    return spanish.format(january) === "enero";
  } catch (_err) {
    return false;
  }
};

const fullICUOnly = hasFullICU() ? "yes" : "no";

export function main(): string {
  return fullICUOnly;
}
