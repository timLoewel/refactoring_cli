import functools


@functools.lru_cache(maxsize=128)
def normalize(text: str) -> str:
    return text.strip().lower()
