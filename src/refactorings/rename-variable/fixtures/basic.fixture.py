params = {"file": "fixture.py", "target": "count", "newName": "value"}

def main():
    count = 42
    doubled = count * 2
    tripled = count * 3
    return str(doubled + tripled)
