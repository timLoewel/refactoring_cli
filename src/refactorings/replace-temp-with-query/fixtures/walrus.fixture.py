params = {"file": "fixture.py", "target": "length", "name": "get_length"}

def process(data):
    if (length := len(data)) > 5:
        return length * 2
    return length

def main():
    result = process([1, 2, 3, 4, 5, 6, 7])
    return str(result)
