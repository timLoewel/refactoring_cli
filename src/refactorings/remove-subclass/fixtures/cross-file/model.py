class Account:
    def __init__(self, balance: int) -> None:
        self.balance = balance


class SavingsAccount(Account):
    def interest(self) -> float:
        return self.balance * 0.05
