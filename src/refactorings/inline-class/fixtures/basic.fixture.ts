class TelephoneNumber {
  areaCode: string = "";
  number: string = "";
}

class Person {
  name: string = "";
}

export function main(): string {
  const phone = new TelephoneNumber();
  phone.areaCode = "555";
  phone.number = "1234";
  const person = new Person();
  person.name = "Bob";
  return `${person.name}: (${phone.areaCode}) ${phone.number}`;
}
