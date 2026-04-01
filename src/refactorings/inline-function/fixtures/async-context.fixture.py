params = {"file": "fixture.py", "target": "double"}

import asyncio


async def fetch():
    return 21


def double(x):
    return x * 2


async def compute():
    raw = await fetch()
    result = double(raw)
    return result


def main():
    return str(asyncio.run(compute()))
