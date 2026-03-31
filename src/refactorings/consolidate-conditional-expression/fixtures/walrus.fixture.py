params = {"file": "fixture.py", "target": "5"}

def main():
    data = [1, 2, 3]
    if (n := len(data)) > 2:
        return str(n)
    if len(data) > 1:
        return str(n)
    return "short"
