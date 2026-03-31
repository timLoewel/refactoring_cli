params = {"file": "fixture.py", "target": 6}

def main():
    items = [1, 2, 3, 4, 5]
    result = []
    for item in items:
        result.append(item * 2)
    return str(result)
