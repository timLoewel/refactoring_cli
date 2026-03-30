params = {"file": "fixture.py", "target": "x", "newName": "outer_x", "line": 1}

def main():
    x = 10
    def inner():
        x = 20
        return x
    result = x + inner()
    return str(result)
