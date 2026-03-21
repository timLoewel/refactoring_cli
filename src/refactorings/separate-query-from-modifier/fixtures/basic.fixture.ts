let alertCount = 0;

function checkAndSetAlarm(readings: number[], threshold: number): string {
  for (const r of readings) {
    if (r > threshold) {
      alertCount++;
      return "alarm";
    }
  }
  return "ok";
}

export function main(): string {
  const result = checkAndSetAlarm([10, 20, 30], 15);
  return `${result}, alerts: ${alertCount}`;
}
