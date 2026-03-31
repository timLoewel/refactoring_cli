params = {"file": "fixture.py", "target": "process"}

data = {"value": 0}

def process(n):
    data["value"] += n
    data["value"] += 100

def main():
    process(5)
    return str(data["value"])
