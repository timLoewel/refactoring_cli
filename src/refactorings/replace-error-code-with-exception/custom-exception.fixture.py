params = {"file": "fixture.py", "target": "withdraw", "exception": "InsufficientFundsError"}

class InsufficientFundsError(Exception):
    pass

def withdraw(balance, amount):
    if amount > balance:
        return -1
    return balance - amount

def main():
    try:
        result = withdraw(100, 30)
        return f"ok:{result}"
    except InsufficientFundsError:
        return "error:insufficient"
