params = {"file": "fixture.py", "target": 5, "destination": 6}

def main():
    result = []
    msg = "hello"
    with open("/dev/null") as f:
        _ = f.read()
    result.append(msg)
    return str(result)
