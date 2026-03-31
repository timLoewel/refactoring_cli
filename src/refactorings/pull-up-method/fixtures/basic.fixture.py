params = {"file": "fixture.py", "target": "Dog", "method": "speak"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name


class Dog(Animal):
    def __init__(self, name: str, breed: str) -> None:
        super().__init__(name)
        self.breed = breed

    def speak(self) -> str:
        return f"{self.name} says: Woof!"


def main() -> str:
    d = Dog("Rex", "Labrador")
    return d.speak()
