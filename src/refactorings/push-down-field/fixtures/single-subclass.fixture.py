params = {"file": "fixture.py", "target": "Vehicle", "field": "fuel_type", "subclass": "Car"}


class Vehicle:
    fuel_type = "gasoline"

    def __init__(self, speed: int) -> None:
        self.speed = speed


class Car(Vehicle):
    def __init__(self, speed: int, brand: str) -> None:
        super().__init__(speed)
        self.brand = brand

    def info(self) -> str:
        return f"{self.brand} runs on {self.fuel_type}"


def main() -> str:
    c = Car(100, "Toyota")
    return c.info()
