params = {"file": "fixture.py", "target": "Account", "field": "interest_rate", "destination": "AccountType", "via": "account_type"}

class AccountType:
    def __init__(self, name: str):
        self.name: str = name

class Account:
    def __init__(self, balance: float, account_type: "AccountType"):
        self.balance: float = balance
        self.interest_rate: float = 0.05
        self.account_type: AccountType = account_type

    def apply_interest(self) -> float:
        return self.balance * self.interest_rate

def main():
    at = AccountType("savings")
    a = Account(1000.0, at)
    result = f"interest={a.apply_interest()}"
    return result
