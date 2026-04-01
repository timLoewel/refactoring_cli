// Function params become Command class fields; main() is independent.
export const params = {
  file: "fixture.ts",
  target: "sendEmail",
  className: "SendEmailCommand",
};

function sendEmail(recipient: string, subject: string, body: string): void {
  // sends an email
}

export function main(): string {
  return "command-pattern-ready";
}
