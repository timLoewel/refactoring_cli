params = {"file": "fixture.py", "startLine": 6, "endLine": 7, "name": "accumulate"}

def main():
    total = 0
    items = [10, 20, 30]
    for item in items:
        total = total + item
    return str(total)
