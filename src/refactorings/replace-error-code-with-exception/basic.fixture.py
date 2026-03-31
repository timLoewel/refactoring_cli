params = {"file": "fixture.py", "target": "find_index"}

def find_index(items, value):
    for i, item in enumerate(items):
        if item == value:
            return i
    return -1

def main():
    try:
        result = find_index([10, 20, 30], 20)
        return f"found:{result}"
    except ValueError:
        return "error:not_found"
