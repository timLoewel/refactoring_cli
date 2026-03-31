params = {"file": "fixture.py", "target": 7}

def main():
    keys = ["a", "b", "c"]
    values = [1, 2, 3]
    result = []
    for k, v in zip(keys, values):
        result.append(f"{k}={v}")
    return str(result)
