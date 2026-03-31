params = {"file": "fixture.py", "target": "fetch_total", "newBody": "    values = [await get_value(k) for k in keys]\n    return sum(values)"}

async def get_value(key):
    return len(key)

async def fetch_total(keys):
    total = 0
    for key in keys:
        value = await get_value(key)
        total = total + value
    return total

import asyncio

def main():
    result = asyncio.run(fetch_total(["abc", "de", "f"]))
    return str(result)
