export const params = {
  file: "fixture.ts",
  target: "TelephoneNumber",
  into: "Person",
};

class TelephoneNumber {
  areaCode: string = "";
  number: string = "";
}

class Person {
  name: string = "";
}

export function main(): string {
  const person = new Person();
  person.name = "Bob";
  const phone = new TelephoneNumber();
  phone.areaCode = "555";
  phone.number = "1234";
  return `${person.name}: (${phone.areaCode}) ${phone.number}`;
}
