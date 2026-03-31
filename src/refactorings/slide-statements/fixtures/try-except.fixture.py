params = {"file": "fixture.py", "target": 5, "destination": 6}

def main():
    result = []
    msg = "safe"
    try:
        x = 1
    except Exception:
        x = 0
    result.append(msg)
    result.append(str(x))
    return str(result)
