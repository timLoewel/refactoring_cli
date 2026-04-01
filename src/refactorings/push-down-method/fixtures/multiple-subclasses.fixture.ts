export const params = {
  file: "fixture.ts",
  target: "Notification",
  method: "send",
  subclass: "EmailNotification",
};

class Notification {
  message: string = "";
  send(): string {
    return `sent: ${this.message}`;
  }
}

class EmailNotification extends Notification {
  recipient: string = "user@example.com";
}

class SmsNotification extends Notification {
  phoneNumber: string = "555-0100";
}

export function main(): string {
  const email = new EmailNotification();
  email.message = "Hello";
  return email.send();
}
