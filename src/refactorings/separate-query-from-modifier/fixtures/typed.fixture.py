params = {"file": "fixture.py", "target": "withdraw_and_balance"}

def withdraw_and_balance(account: dict, amount: float) -> float:
    account["balance"] -= amount
    return account["balance"]

def main():
    acc = {"balance": 100.0}
    remaining = withdraw_and_balance(acc, 30.0)
    return f"{remaining},{acc['balance']}"
