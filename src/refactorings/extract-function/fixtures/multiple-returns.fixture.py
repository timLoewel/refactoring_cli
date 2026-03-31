params = {"file": "fixture.py", "startLine": 5, "endLine": 10, "name": "classify"}

def main():
    x = 42
    if x > 100:
        label = "big"
    elif x > 10:
        label = "medium"
    else:
        label = "small"
    return label
