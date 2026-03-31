params = {"file": "fixture.py", "target": "Roster", "field": "names"}

class Roster:
    def __init__(self):
        self.names = []

def main():
    r = Roster()
    r.names.append("Alice")
    r.names.append("Bob")
    snapshot = tuple(r.names)
    r.names.append("Charlie")
    current = tuple(r.names)
    return f"snap={','.join(snapshot)},current={','.join(current)}"
