params = {"file": "service.py", "target": "send_email", "params": "to,subject,body", "objectName": "msg", "className": "EmailMessage"}

from service import notify_user

def main():
    result = notify_user("alice@example.com")
    return result
