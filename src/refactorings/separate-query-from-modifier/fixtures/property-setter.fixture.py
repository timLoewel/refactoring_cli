params = {"file": "fixture.py", "target": "update_name"}

class Person:
    def __init__(self, name):
        self._name = name
        self._last_updated = None

    def update_name(self, new_name):
        self._last_updated = self._name
        self._name = new_name
        return self._last_updated

def main():
    p = Person("Alice")
    old = p.update_name("Bob")
    return f"{old},{p._name},{p._last_updated}"
