params = {"file": "fixture.py", "target": "Dog", "field": "sound"}

from dataclasses import dataclass


@dataclass
class Animal:
    name: str


@dataclass
class Dog(Animal):
    sound: str = "Woof"

    def speak(self) -> str:
        return f"{self.name}: {self.sound}"


def main() -> str:
    d = Dog(name="Rex")
    return d.speak()
