params = {"file": "fixture.py", "target": "n", "newName": "length"}

def main():
    a = [1, 2, 3]
    if (n := len(a)) > 0:
        result = n * 10
    else:
        result = 0
    return str(result)
