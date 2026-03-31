params = {"file": "fixture.py", "target": "max_retries"}

max_retries: int = 3

def should_retry(attempt: int) -> bool:
    return attempt < max_retries

def main():
    results = []
    for i in range(5):
        results.append(str(should_retry(i)))
    return ",".join(results)
