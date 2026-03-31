params = {"file": "fixture.py", "target": 6}

def main():
    items = [1, 2, 2, 3, 3, 3]
    unique = set()
    for item in items:
        unique.add(item)
    return str(sorted(unique))
