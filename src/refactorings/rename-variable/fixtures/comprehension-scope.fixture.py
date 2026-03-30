params = {"file": "fixture.py", "target": "items", "newName": "values"}

def main():
    items = [1, 2, 3, 4, 5]
    doubled = [x * 2 for x in items]
    return str(sum(doubled))
