params = {"file": "fixture.py", "target": "Bird", "method": "speed"}


class Bird:
    def __init__(self, name: str) -> None:
        self.name = name

    def speed(self) -> int:
        if isinstance(self, EuropeanBird):
            return 40
        elif isinstance(self, AfricanBird):
            return 25
        else:
            return 0


class EuropeanBird(Bird):
    pass


class AfricanBird(Bird):
    pass


def main() -> str:
    b = EuropeanBird("tweety")
    return f"speed={b.speed()}"
