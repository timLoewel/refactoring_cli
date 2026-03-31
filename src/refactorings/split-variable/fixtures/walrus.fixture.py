params = {"file": "fixture.py", "target": "n"}

def main():
    data = [1, 2, 3, 4, 5]
    n = len(data)
    total = n * 10
    n = sum(data)
    average = n / len(data)
    return str(int(total + average))
