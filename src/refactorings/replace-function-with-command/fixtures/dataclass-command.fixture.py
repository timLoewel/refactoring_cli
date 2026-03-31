params = {"file": "fixture.py", "target": "send_email", "className": "SendEmail", "style": "dataclass"}

def send_email(recipient: str, subject: str, body: str) -> str:
    return f"To: {recipient}, Subject: {subject}, Body: {body}"

def main():
    result = send_email("alice@example.com", "Hello", "Hi there")
    return result
