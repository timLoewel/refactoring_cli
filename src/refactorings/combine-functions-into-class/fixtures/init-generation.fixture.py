params = {"file": "fixture.py", "target": "format_name,format_email,format_phone", "className": "ContactFormatter", "sharedParam": "contact"}


def format_name(contact):
    return f"{contact['first']} {contact['last']}"


def format_email(contact):
    return contact["email"].lower()


def format_phone(contact):
    digits = "".join(c for c in contact["phone"] if c.isdigit())
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


def main():
    contact = {"first": "John", "last": "Doe", "email": "JOHN@EXAMPLE.COM", "phone": "5551234567"}
    name = format_name(contact)
    email = format_email(contact)
    phone = format_phone(contact)
    return f"{name}, {email}, {phone}"
