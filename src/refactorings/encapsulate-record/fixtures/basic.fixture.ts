class Organization {
  name: string = "";
  country: string = "";
}

export function main(): string {
  const org = new Organization();
  org.name = "Acme";
  org.country = "US";
  return `${org.name} (${org.country})`;
}
