params = {"file": "fixture.py", "target": "temperature", "className": "Temperature"}

temperature: float = 36.6

def is_fever(temp: float) -> bool:
    return temp > 37.5

def main():
    result = f"temp={temperature},fever={is_fever(temperature)}"
    return result
