params = {"file": "fixture.py", "target": "TelephoneNumber", "into": "Person"}

class TelephoneNumber:
    def __init__(self, area_code, number):
        self.area_code = area_code
        self.number = number

    def formatted(self):
        return f"({self.area_code}) {self.number}"

class Person:
    def __init__(self, name, area_code, number):
        self.name = name
        self._phone = TelephoneNumber(area_code, number)

    def phone_display(self):
        return self._phone.formatted()

def main():
    p = Person("Alice", "555", "1234")
    return p.phone_display()
