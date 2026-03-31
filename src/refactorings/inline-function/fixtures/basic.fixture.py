params = {"file": "fixture.py", "target": "greet"}

def greet(name):
    message = "Hello, " + name + "!"
    return message

def main():
    result = greet("World")
    return result
