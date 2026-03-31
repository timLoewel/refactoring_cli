params = {"file": "fixture.py", "target": "Dog", "field": "legs"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name


class Dog(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)
        self.legs = 4

    def info(self) -> str:
        return f"{self.name} has {self.legs} legs"


def main() -> str:
    d = Dog("Rex")
    return d.info()
