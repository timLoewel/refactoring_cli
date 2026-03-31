params = {"file": "fixture.py", "target": "Vehicle", "method": "honk", "subclass": "Car"}


class Vehicle:
    def __init__(self, speed: int) -> None:
        self.speed = speed

    def honk(self) -> str:
        return "Beep beep!"


class Car(Vehicle):
    def __init__(self, speed: int, brand: str) -> None:
        super().__init__(speed)
        self.brand = brand


class Bicycle(Vehicle):
    def __init__(self, speed: int) -> None:
        super().__init__(speed)


def main() -> str:
    c = Car(60, "Toyota")
    return c.honk()
