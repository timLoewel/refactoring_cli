params = {"file": "fixture.py", "target": "ExpressShipment"}


class Shipment:
    def __init__(self, weight: float) -> None:
        self.weight = weight

    def cost(self) -> float:
        return self.weight * 2.0


class ExpressShipment(Shipment):
    def cost(self) -> float:
        return self.weight * 5.0


def make_shipment(weight: float) -> "Shipment":
    return ExpressShipment(weight)


def main() -> str:
    s = make_shipment(10.0)
    return f"cost={s.cost()}"
