params = {"file": "fixture.py", "target": "order_id", "className": "OrderId"}

order_id = "ORD-12345"

def process_order(oid):
    return f"Processing {oid}"

def main():
    result = process_order(order_id)
    return result
