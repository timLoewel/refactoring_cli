params = {"file": "fixture.py", "target": "process", "startLine": 8, "endLine": 10}

data = {"value": 0}

def process(n):
    data["value"] += n

if True:
    extra = 25
    data["value"] += extra

def main():
    process(10)
    return str(data["value"])
