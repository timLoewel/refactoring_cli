params = {"file": "fixture.py", "target": "render_widget", "flag": "compact"}

def render_widget(size, compact):
    if compact:
        return f"[compact:{size}]"
    return f"[full:{size}]"

def main():
    a = render_widget(10, True)
    b = render_widget(20, False)
    return f"{a} {b}"
