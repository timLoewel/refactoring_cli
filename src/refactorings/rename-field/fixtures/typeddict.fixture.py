params = {"file": "fixture.py", "target": "Options", "field": "max_items", "newName": "limit"}

from typing import TypedDict

class Options(TypedDict):
    max_items: int
    verbose: bool

def main():
    opts: Options = {"max_items": 10, "verbose": True}
    val = opts["max_items"]
    return str(val) + "," + str(opts["verbose"])
