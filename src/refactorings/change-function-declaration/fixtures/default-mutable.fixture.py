params = {"file": "fixture.py", "target": "append_to", "param_name": "lst", "new_param_name": "items"}

def append_to(val, lst=[]):
    lst.append(val)
    return lst

def main():
    result = append_to(1, lst=[10, 20])
    return str(result)
