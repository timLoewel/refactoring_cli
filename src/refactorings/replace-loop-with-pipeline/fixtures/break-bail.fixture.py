params = {"file": "fixture.py", "target": 6}

def main():
    items = [1, 5, 3, 8, 2]
    result = None
    for item in items:
        if item > 4:
            result = item
            break
    return str(result)
