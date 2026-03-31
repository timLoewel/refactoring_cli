params = {"file": "fixture.py", "target": "accumulate", "startLine": 8, "endLine": 9}

totals: dict[str, int] = {"sum": 0}

def accumulate(n: int) -> None:
    totals["sum"] += n

bonus: int = 50
totals["sum"] += bonus

def main() -> str:
    accumulate(10)
    return str(totals["sum"])
