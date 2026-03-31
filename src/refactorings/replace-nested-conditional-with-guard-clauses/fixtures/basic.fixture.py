params = {"file": "fixture.py", "target": "get_pay_amount"}

def get_pay_amount(is_separated, is_retired, normal_pay):
    if is_separated:
        return 0
    else:
        if is_retired:
            return 0
        else:
            return normal_pay

def main():
    result = get_pay_amount(False, False, 1000)
    return str(result)
