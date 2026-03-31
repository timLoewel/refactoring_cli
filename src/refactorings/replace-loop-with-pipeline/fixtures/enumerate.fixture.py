params = {"file": "fixture.py", "target": 6}

def main():
    items = ["a", "b", "c"]
    result = []
    for i, item in enumerate(items):
        result.append(f"{i}:{item}")
    return str(result)
