params = {"file": "fixture.py", "target": 6}

def main():
    numbers = [1, 2, 3, 4, 5]
    total = 0
    for n in numbers:
        total += n
    return str(total)
