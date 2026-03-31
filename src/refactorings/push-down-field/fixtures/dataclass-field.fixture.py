params = {"file": "fixture.py", "target": "Animal", "field": "sound", "subclass": "Dog"}

from dataclasses import dataclass


@dataclass
class Animal:
    name: str
    sound: str = "..."


@dataclass
class Dog(Animal):
    def speak(self) -> str:
        return f"{self.name}: {self.sound}"


def main() -> str:
    d = Dog(name="Rex")
    return d.speak()
