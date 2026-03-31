params = {"file": "fixture.py", "target": 6}

def main():
    pairs = [("a", 1), ("b", 2), ("c", 3)]
    result = {}
    for key, value in pairs:
        result[key] = value
    return str(result)
