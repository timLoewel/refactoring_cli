params = {"file": "fixture.py", "target": "Dog", "method": "breathe"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name


class Dog(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)

    def breathe(self) -> str:
        return "inhale/exhale"


class Cat(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)

    def breathe(self) -> str:
        return "inhale/exhale"


def main() -> str:
    d = Dog("Rex")
    return d.breathe()
