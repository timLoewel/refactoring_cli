params = {"file": "fixture.py", "target": "total"}


class ShoppingCart:
    def __init__(self, quantity: int, price: float) -> None:
        self.quantity = quantity
        self.price = price
        self.total = self.quantity * self.price


def main() -> str:
    cart = ShoppingCart(5, 20.0)
    return f"Total: {cart.total}"
