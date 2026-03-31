params = {"file": "fixture.py", "target": "base_charge,tax_charge", "className": "Billing", "sharedParam": "usage"}


def base_charge(usage):
    return usage * 0.1


def tax_charge(usage):
    return max(0, usage - 100) * 0.05


def main():
    usage = 250
    base = base_charge(usage)
    tax = tax_charge(usage)
    return f"base={base:.2f}, tax={tax:.2f}"
