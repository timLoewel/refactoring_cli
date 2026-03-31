params = {"file": "fixture.py", "target": "accumulate"}

totals: dict[str, int] = {"sum": 0}
bonus: int = 50

def accumulate(n: int) -> None:
    totals["sum"] += n
    totals["sum"] += bonus

def main() -> str:
    accumulate(10)
    return str(totals["sum"])
