params = {"file": "fixture.py", "target": "Counter", "factoryName": "create_counter"}

class Counter:
    def __new__(cls, start: int = 0):
        instance = super().__new__(cls)
        instance._count = start
        return instance

    def increment(self) -> int:
        self._count += 1
        return self._count

def main():
    c = Counter(5)
    c.increment()
    return str(c.increment())
