params = {"file": "fixture.py", "target": "add", "startLine": 8, "endLine": 8}

counter = {"value": 0}

def add(n):
    counter["value"] += n

counter["value"] += 100

def main():
    add(5)
    return str(counter["value"])
