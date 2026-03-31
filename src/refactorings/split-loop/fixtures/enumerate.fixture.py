params = {"file": "fixture.py", "target": "7"}

def main():
    names = ["alice", "bob", "charlie"]
    indexed = []
    upper = []
    for i, name in enumerate(names):
        indexed.append(f"{i}:{name}")
        upper.append(name.upper())
    return ",".join(indexed) + "|" + ",".join(upper)
