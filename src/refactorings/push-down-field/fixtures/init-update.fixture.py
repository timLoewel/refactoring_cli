params = {"file": "fixture.py", "target": "Animal", "field": "legs", "subclass": "Dog"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name
        self.legs = 4


class Dog(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)

    def info(self) -> str:
        return f"{self.name} has {self.legs} legs"


def main() -> str:
    d = Dog("Rex")
    return d.info()
