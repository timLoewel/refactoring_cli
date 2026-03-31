params = {"file": "fixture.py", "target": "FilteredList", "delegateFieldName": "list_delegate"}

class Container:
    def __init__(self) -> None:
        self.items: list[str] = []

    def add(self, item: str) -> None:
        self.items.append(item)

    def size(self) -> int:
        return len(self.items)

    def get_all(self) -> list[str]:
        return list(self.items)


class FilteredList(Container):
    def add_if_new(self, item: str) -> None:
        if item not in self.get_all():
            self.add(item)


def main() -> str:
    fl = FilteredList()
    fl.add("apple")
    fl.add_if_new("banana")
    fl.add_if_new("apple")
    return f"size={fl.size()}, items={fl.get_all()}"
