params = {"file": "fixture.py", "target": "get_name", "condition": "hasattr(obj, 'name')"}

class Person:
    def __init__(self, name):
        self.name = name

class Empty:
    pass

def get_name(obj):
    try:
        return obj.name
    except AttributeError:
        return "unknown"

def main():
    return f"{get_name(Person('Alice'))},{get_name(Empty())}"
