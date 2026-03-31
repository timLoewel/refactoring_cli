params = {"file": "fixture.py", "target": "Color", "field": "red", "newName": "r"}

from typing import NamedTuple

class Color(NamedTuple):
    red: int
    green: int
    blue: int

def main():
    c = Color(red=255, green=128, blue=0)
    val = c.red + c.green + c.blue
    return str(val)
