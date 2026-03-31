params = {"file": "fixture.py", "target": "Greeter"}

class Greeter:
    def __init__(self, name):
        self.name = name

    def execute(self):
        return f"Hello, {self.name}!"

def main():
    result = Greeter("Alice").execute()
    return result
