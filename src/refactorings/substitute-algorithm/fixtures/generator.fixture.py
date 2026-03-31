params = {"file": "fixture.py", "target": "even_numbers", "newBody": "    yield from (x for x in items if x % 2 == 0)"}

def even_numbers(items):
    for item in items:
        if item % 2 == 0:
            yield item

def main():
    result = list(even_numbers([1, 2, 3, 4, 5, 6]))
    return str(result)
