params = {"file": "fixture.py", "startLine": 8, "endLine": 9, "name": "compute_total"}

class Cart:
    def __init__(self):
        self.items = [10, 20, 30]

    def checkout(self):
        subtotal = sum(self.items)
        total = subtotal * 1.1
        return total

def main():
    cart = Cart()
    return str(cart.checkout())
