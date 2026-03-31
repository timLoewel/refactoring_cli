def send_email(to, subject, body):
    return f"Sent to {to}: [{subject}] {body}"

def notify_user(email):
    return send_email(email, "Hello", "Welcome!")
