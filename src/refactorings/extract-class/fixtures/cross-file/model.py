class Person:
    def __init__(self, name, street, city):
        self.name = name
        self.street = street
        self.city = city

    def label(self):
        return f"{self.name} at {self.street}, {self.city}"
