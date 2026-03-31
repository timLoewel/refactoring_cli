params = {"file": "fixture.py", "startLine": 4, "endLine": 5, "name": "compute_values"}

def main():
    data = [1, 2, 3, 4, 5]
    evens = [x for x in data if x % 2 == 0]
    total = sum(evens)
    return str(total)
