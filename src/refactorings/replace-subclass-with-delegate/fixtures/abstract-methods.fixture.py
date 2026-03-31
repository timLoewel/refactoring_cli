params = {"file": "fixture.py", "target": "Dog", "delegateClassName": "DogBehavior"}

from abc import abstractmethod


class Animal:
    @abstractmethod
    def speak(self) -> str:
        pass

    def description(self) -> str:
        return "Some animal"


class Dog(Animal):
    def speak(self) -> str:
        return "Woof!"


def main() -> str:
    d = Dog()
    return d.speak()
