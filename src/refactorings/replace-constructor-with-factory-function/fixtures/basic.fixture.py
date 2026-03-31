params = {"file": "fixture.py", "target": "Dog", "factoryName": "create_dog"}

class Dog:
    def __init__(self, name):
        self.name = name

    def speak(self):
        return f"{self.name} says Woof!"

def main():
    dog = Dog("Rex")
    return dog.speak()
