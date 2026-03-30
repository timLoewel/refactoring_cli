from datetime import date

def format_date(year, month, day):
    d = date(year, month, day)
    return d.isoformat()
