params = {"file": "fixture.py", "target": "Employee", "field": "phone", "destination": "ContactInfo", "via": "contact"}

class ContactInfo:
    def __init__(self):
        self.email = ""

class Employee:
    def __init__(self, name):
        self.name = name
        self.contact = ContactInfo()
        self._phone = "555-0000"

    @property
    def phone(self):
        return self._phone

    @phone.setter
    def phone(self, value):
        self._phone = value

    def display(self):
        return f"{self.name}: {self.phone}"

    def set_phone(self, value):
        self.phone = value

def main():
    e = Employee("Alice")
    e.set_phone("555-1234")
    result = f"display={e.display()}"
    e.set_phone("555-5678")
    result += f",updated={e.display()}"
    return result
