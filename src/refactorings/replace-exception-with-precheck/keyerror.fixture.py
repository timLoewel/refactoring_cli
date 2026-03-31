params = {"file": "fixture.py", "target": "get_value", "condition": "key in data"}

def get_value(data, key):
    try:
        return data[key]
    except KeyError:
        return "default"

def main():
    d = {"a": 1, "b": 2}
    return f"{get_value(d, 'a')},{get_value(d, 'c')}"
