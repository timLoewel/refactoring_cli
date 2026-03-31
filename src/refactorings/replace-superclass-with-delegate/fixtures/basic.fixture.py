params = {"file": "fixture.py", "target": "Stack", "delegateFieldName": "delegate"}

class List:
    def __init__(self):
        self.items = []

    def add(self, item: str) -> None:
        self.items.append(item)

    def count(self) -> int:
        return len(self.items)


class Stack(List):
    def description(self) -> str:
        return f"Stack with {self.count()} items"


def main() -> str:
    stack = Stack()
    stack.add("one")
    stack.add("two")
    return stack.description()
