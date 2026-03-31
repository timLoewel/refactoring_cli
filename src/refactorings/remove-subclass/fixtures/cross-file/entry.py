params = {"file": "model.py", "target": "SavingsAccount"}

from model import Account, SavingsAccount


def main() -> str:
    acc = SavingsAccount(500)
    return f"balance={acc.balance}, interest={acc.interest()}"
