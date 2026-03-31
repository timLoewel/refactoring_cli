params = {"file": "fixture.py", "startLine": 10, "endLine": 11, "name": "process_data"}

import asyncio

async def get_value():
    return 42

async def compute():
    base = 10
    value = await get_value()
    result = base + value
    return result

def main():
    return str(asyncio.run(compute()))
