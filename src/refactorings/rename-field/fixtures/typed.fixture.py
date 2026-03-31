params = {"file": "fixture.py", "target": "Config", "field": "max_retries", "newName": "retry_limit"}

class Config:
    max_retries: int
    timeout: float

    def __init__(self, retries: int, timeout: float):
        self.max_retries = retries
        self.timeout = timeout

    def describe(self) -> str:
        return f"retries={self.max_retries}, timeout={self.timeout}"

def main():
    c = Config(3, 1.5)
    result = c.max_retries * 2
    return str(result) + "," + c.describe()
