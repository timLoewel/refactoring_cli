params = {"file": "fixture.py", "target": "7"}

def main():
    items = [1, 2, 3, 4, 5]
    total = 0
    evens = []
    for x in items:
        total += x
        if x % 2 == 0:
            evens.append(x)
    return str(total) + "," + str(evens)
