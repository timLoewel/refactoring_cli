params = {"file": "fixture.py", "target": "Dog", "field": "legs"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name


class Dog(Animal):
    legs = 4

    def __init__(self, name: str) -> None:
        super().__init__(name)


class Cat(Animal):
    legs = 4

    def __init__(self, name: str) -> None:
        super().__init__(name)


def main() -> str:
    d = Dog("Rex")
    return f"{d.name} has {d.legs} legs"
