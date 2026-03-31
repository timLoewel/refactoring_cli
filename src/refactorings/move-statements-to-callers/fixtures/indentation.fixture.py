params = {"file": "fixture.py", "target": "process"}

data = {"value": 0}

def process(n):
    data["value"] += n
    data["value"] += 25

def main():
    if True:
        process(10)
    return str(data["value"])
