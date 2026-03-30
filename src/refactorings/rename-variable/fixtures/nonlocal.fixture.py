params = {"file": "fixture.py", "target": "counter", "newName": "count"}

def main():
    counter = 0
    def increment():
        nonlocal counter
        counter += 1
    increment()
    increment()
    return str(counter)
