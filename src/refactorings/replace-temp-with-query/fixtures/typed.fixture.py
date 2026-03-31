params = {"file": "fixture.py", "target": "total", "name": "get_total"}

def compute(prices: list[float], tax_rate: float) -> float:
    total: float = sum(prices) * (1 + tax_rate)
    if total > 1000:
        return total * 0.95
    return total

def main():
    result = compute([100.0, 200.0, 300.0], 0.1)
    return str(result)
