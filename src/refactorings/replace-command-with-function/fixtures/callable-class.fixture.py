params = {"file": "fixture.py", "target": "Formatter"}

class Formatter:
    def __init__(self, prefix):
        self.prefix = prefix

    def __call__(self, value):
        return f"{self.prefix}: {value}"

def main():
    fmt = Formatter("INFO")
    result = fmt("test message")
    return result
