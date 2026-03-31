params = {"file": "fixture.py", "target": "Customer"}


class Customer:
    def __init__(self, name: str) -> None:
        self.name = name


def main() -> str:
    c = Customer("Alice")
    return f"Hello, {c.name}"
