params = {"file": "fixture.py", "target": 6, "destination": 4}

def gen():
    x = 1
    yield x
    y = 2
    z = x + y
    yield z

def main():
    return str(list(gen()))
