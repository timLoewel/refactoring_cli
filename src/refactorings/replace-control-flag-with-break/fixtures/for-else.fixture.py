params = {"file": "fixture.py", "target": "found_flag"}

def search_items(items, target):
    found_flag = False
    result = None
    for item in items:
        if item == target:
            found_flag = True
            result = item
    if found_flag:
        return f"Found: {result}"
    return "Not found"

def main():
    result = search_items(["a", "b", "c"], "b")
    return str(result)
