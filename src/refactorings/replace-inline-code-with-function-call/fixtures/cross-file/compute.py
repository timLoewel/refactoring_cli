from utils import nums


def compute() -> str:
    a = sum(nums)
    b = sum(nums) * 2
    return f"{a},{b}"
