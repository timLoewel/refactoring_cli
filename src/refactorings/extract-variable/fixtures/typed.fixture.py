params = {"file": "fixture.py", "target": "len(items)", "name": "count"}

def main():
    items = [1, 2, 3]
    result = len(items) * 2
    return str(result)
