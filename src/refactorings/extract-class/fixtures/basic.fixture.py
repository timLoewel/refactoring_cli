params = {"file": "fixture.py", "target": "Person", "fields": "street,city", "newClassName": "Address"}

class Person:
    def __init__(self, name, street, city):
        self.name = name
        self.street = street
        self.city = city

    def label(self):
        return f"{self.name} at {self.street}, {self.city}"

def main():
    p = Person("Alice", "123 Main St", "Springfield")
    return p.label()
