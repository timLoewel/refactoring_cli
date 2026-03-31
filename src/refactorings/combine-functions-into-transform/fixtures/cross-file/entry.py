params = {"file": "enrichments.py", "functions": "enrich_discounted,enrich_tax", "name": "enrich_order"}

from enrichments import enrich_discounted, enrich_tax


def main():
    order = {"price": 100.0, "discount": 0.1, "tax_rate": 0.15}
    order = enrich_discounted(order)
    order = enrich_tax(order)
    return f"discounted={order['discounted']}, tax={order['tax']}"
