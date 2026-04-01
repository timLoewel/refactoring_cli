import asyncio
from worker import fetch_data

params = {"file": "worker.py", "target": "fetch_data", "destination": "io_helpers.py"}


def main():
    return str(asyncio.run(fetch_data("key")))
