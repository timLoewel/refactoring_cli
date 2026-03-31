params = {"file": "fixture.py", "target": "keep_going"}

def find_first(items):
    keep_going = True
    result = -1
    i = 0
    while keep_going:
        if i >= len(items):
            keep_going = False
        elif items[i] > 3:
            result = items[i]
            keep_going = False
        else:
            i += 1
    return result

def main():
    result = find_first([1, 2, 3, 4, 5])
    return str(result)
