params = {"file": "fixture.py", "target": "Car"}

__all__ = ["Vehicle", "Car"]


class Vehicle:
    def __init__(self, speed: int = 0) -> None:
        self.speed = speed

    def accelerate(self, amount: int) -> None:
        self.speed += amount


class Car(Vehicle):
    pass


def main() -> str:
    car = Car(0)
    car.accelerate(60)
    return f"speed is {car.speed}"
