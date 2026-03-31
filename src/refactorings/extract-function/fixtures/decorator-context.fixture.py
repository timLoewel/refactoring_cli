params = {"file": "fixture.py", "startLine": 7, "endLine": 8, "name": "compute"}

from functools import lru_cache

@lru_cache(maxsize=128)
def expensive(n):
    result = n * n
    doubled = result * 2
    return doubled

def main():
    return str(expensive(5))
