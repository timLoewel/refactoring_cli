params = {"file": "fixture.py", "target": "__balance", "className": "Account"}

class Account:
    def __init__(self, initial):
        self.__balance = initial

    def deposit(self, amount):
        self.__balance += amount

    def get_info(self):
        return f"balance={self.__balance}"

def main():
    a = Account(100)
    a.deposit(50)
    return a.get_info()
