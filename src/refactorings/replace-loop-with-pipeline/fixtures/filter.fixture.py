params = {"file": "fixture.py", "target": 6}

def main():
    numbers = [1, 2, 3, 4, 5, 6]
    evens = []
    for n in numbers:
        if n % 2 == 0:
            evens.append(n)
    return str(evens)
