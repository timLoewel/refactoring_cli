params = {"file": "fixture.py", "target": "EmailSender"}

class EmailSender:
    def __init__(self, recipient, subject):
        self.recipient = recipient
        self.subject = subject
        self.sent = False

    def execute(self):
        self.sent = True
        return f"To: {self.recipient}, Subject: {self.subject}"

def main():
    sender = EmailSender("alice@example.com", "Hello")
    result = sender.execute()
    return result
