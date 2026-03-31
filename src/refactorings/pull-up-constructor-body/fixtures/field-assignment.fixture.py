params = {"file": "fixture.py", "target": "Car"}


class Vehicle:
    pass


class Car(Vehicle):
    def __init__(self, make, model, year):
        super().__init__()
        self.make = make
        self.model = model
        self.year = year


def main():
    c = Car("Toyota", "Corolla", 2020)
    return f"{c.make} {c.model} {c.year}"
