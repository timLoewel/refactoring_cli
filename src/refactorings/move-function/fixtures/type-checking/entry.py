from source import summarize

params = {"file": "source.py", "target": "summarize", "destination": "dest.py"}


def main():
    return summarize(["one", "two", "three"])
