params = {"file": "fixture.py", "target": "8"}

def main():
    keys = ["a", "b", "c"]
    vals = [1, 2, 3]
    pairs = []
    sums = 0
    for k, v in zip(keys, vals):
        pairs.append(f"{k}={v}")
        sums += v
    return ",".join(pairs) + "|" + str(sums)
