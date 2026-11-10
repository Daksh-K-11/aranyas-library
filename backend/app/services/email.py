"""Minimal SMTP sender (stdlib only). Runs the blocking SMTP call in a thread."""
import asyncio
import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.core.config import (
    APP_ENV,
    APP_NAME,
    EMAIL_ENABLED,
    SMTP_FROM,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_SSL,
    SMTP_USERNAME,
)

log = logging.getLogger("library.email")


def _send_sync(msg: EmailMessage) -> None:
    ctx = ssl.create_default_context()
    if SMTP_USE_SSL:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=15) as s:
            if SMTP_USERNAME:
                s.login(SMTP_USERNAME, SMTP_PASSWORD or "")
            s.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.ehlo()
            s.starttls(context=ctx)
            s.ehlo()
            if SMTP_USERNAME:
                s.login(SMTP_USERNAME, SMTP_PASSWORD or "")
            s.send_message(msg)


async def send_email(to: str, subject: str, text: str, html_body: str) -> bool:
    if not EMAIL_ENABLED:
        if APP_ENV == "production":
            log.error("Email not sent to %s: SMTP is not configured", to)
        else:
            log.warning("[DEV EMAIL - SMTP not configured] to=%s subject=%s\n%s", to, subject, text)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((SMTP_FROM_NAME or APP_NAME, SMTP_FROM))
    msg["To"] = to
    msg["Message-ID"] = make_msgid()
    msg.set_content(text)
    msg.add_alternative(html_body, subtype="html")
    try:
        await asyncio.to_thread(_send_sync, msg)
        return True
    except Exception as e:  # never leak SMTP errors to clients
        log.error("Failed to send email to %s: %r", to, e)
        return False


PURPOSE_COPY = {
    "verify": ("Verify your email", "Use this code to verify your email address"),
    "reset": ("Reset your password", "Use this code to reset your password"),
}


def otp_email(code: str, purpose: str, minutes: int) -> tuple[str, str, str]:
    title, lead = PURPOSE_COPY[purpose]
    subject = f"{code} is your {APP_NAME} code"
    text = (
        f"{lead}:\n\n    {code}\n\n"
        f"The code expires in {minutes} minutes. If you didn't request it, you can ignore this email; "
        f"nobody can access your account without it.\n\n- {APP_NAME}"
    )
    esc = html.escape
    html_body = f"""<!doctype html><html><body style="margin:0;background:#f6f2ec;font-family:Arial,Helvetica,sans-serif;color:#3a2a20">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-family:Georgia,serif;font-size:22px;font-weight:bold;padding-bottom:8px">{esc(APP_NAME)}</td></tr>
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:8px">{esc(title)}</td></tr>
<tr><td style="font-size:14px;color:#6b5a4e;padding-bottom:20px">{esc(lead)}:</td></tr>
<tr><td align="center" style="font-size:34px;letter-spacing:10px;font-weight:bold;background:#f3ece4;border-radius:12px;padding:16px 0">{esc(code)}</td></tr>
<tr><td style="font-size:13px;color:#6b5a4e;padding-top:20px">This code expires in {minutes} minutes.
If you didn't request it, ignore this email. Nobody can access your account without it.</td></tr>
</table></td></tr></table></body></html>"""
    return subject, text, html_body


def account_exists_email() -> tuple[str, str, str]:
    subject = f"You already have a {APP_NAME} account"
    text = (
        "Someone (hopefully you) tried to create an account with this email address, "
        "but an account already exists.\n\nIf you forgot your password, use 'Forgot password' "
        f"on the sign-in page. If this wasn't you, you can ignore this email.\n\n- {APP_NAME}"
    )
    html_body = f"<p>{html.escape(text).replace(chr(10), '<br>')}</p>"
    return subject, text, html_body
