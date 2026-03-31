params = {"file": "fixture.py", "target": "normalize"}

def normalize(values: list[float]) -> None:
    total = sum(values)
    for i in range(len(values)):
        values[i] = values[i] / total

def main():
    data = [10.0, 20.0, 30.0]
    normalize(data)
    return ",".join(f"{v:.2f}" for v in data)
