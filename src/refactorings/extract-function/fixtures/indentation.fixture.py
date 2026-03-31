params = {"file": "fixture.py", "startLine": 7, "endLine": 8, "name": "process_item"}

def main():
    items = [1, 2, 3]
    result = []
    for item in items:
        doubled = item * 2
        result.append(doubled)
    return str(result)
