params = {"file": "fixture.py", "target": 6}

def main():
    matrix = [[1, 2], [3, 4], [5, 6]]
    flat = []
    for row in matrix:
        for x in row:
            flat.append(x)
    return str(flat)
