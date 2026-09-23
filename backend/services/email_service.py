import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from config import Config

LOGO_TEXT_URL = "https://imagedelivery.net/h9fmMoa1o2c2P55TcWJGOg/afb2d01e-3c6d-4dc3-8dfc-aceaf3f69700/public"


def verification_email_html(full_name: str, code: str) -> str:
    safe_name = escape(full_name or "there")
    return f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#f3f6fb;font-family:Inter,Arial,sans-serif;color:#0f172a;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;">
                <tr>
                  <td style="background:#06142B;padding:28px 32px;">
                    <img src="{LOGO_TEXT_URL}" alt="VireSend" style="display:block;height:28px;width:auto;max-width:180px;margin:0 0 8px;" />
                    <div style="color:#94a3b8;font-size:14px;margin-top:6px;">Secure account verification</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">Verify your VireSend account</h1>
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#475569;">Hi {safe_name},</p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#475569;">Your VireSend verification code is below. Enter it in the app to complete your signup.</p>
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:22px;text-align:center;margin:0 0 22px;">
                      <div style="font-size:36px;letter-spacing:8px;font-weight:800;color:#1d4ed8;">{code}</div>
                    </div>
                    <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#475569;">This code expires in <strong>10 minutes</strong>.</p>
                    <p style="margin:0;font-size:13px;line-height:1.7;color:#64748b;">If you did not create a VireSend account, you can safely ignore this email.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """


def password_reset_email_html(full_name: str, reset_url: str) -> str:
    safe_name = escape(full_name or "there")
    safe_url = escape(reset_url, quote=True)
    return f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#f3f6fb;font-family:Inter,Arial,sans-serif;color:#0f172a;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 24px 60px rgba(15,23,42,0.12);">
                <tr>
                  <td align="center" style="padding:34px 32px 16px;">
                    <img src="{LOGO_TEXT_URL}" alt="VireSend" style="display:block;width:220px;max-width:80%;height:auto;margin:0 auto;" />
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 36px 36px;">
                    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#06142B;text-align:center;">Reset your password</h1>
                    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Hello {safe_name},</p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#475569;">We received a request to reset your VireSend password.</p>
                    <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#475569;">Click the secure button below to create a new password.</p>
                    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 26px;">
                      <tr>
                        <td style="border-radius:14px;background:linear-gradient(135deg,#2563eb 0%,#06142B 100%);">
                          <a href="{safe_url}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:14px;">Reset Password</a>
                        </td>
                      </tr>
                    </table>
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:14px 16px;margin:0 0 18px;">
                      <p style="margin:0;font-size:14px;line-height:1.6;color:#1e40af;">This reset link expires in <strong>30 minutes</strong>.</p>
                    </div>
                    <p style="margin:0 0 28px;font-size:13px;line-height:1.7;color:#64748b;">If you did not request this password reset, you can safely ignore this email.</p>
                    <p style="margin:0;text-align:center;font-size:12px;color:#94a3b8;">&copy; 2026 VireSend. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """


def send_verification_email(to_email: str, full_name: str, code: str) -> None:
    required = [Config.SMTP_HOST, Config.SMTP_USERNAME, Config.SMTP_PASSWORD, Config.SMTP_FROM]
    if not all(required):
        raise RuntimeError("SMTP is not configured.")

    message = EmailMessage()
    message["Subject"] = "Verify Your VireSend Account"
    message["From"] = Config.SMTP_FROM
    message["To"] = to_email
    message.set_content(
        f"Your VireSend verification code is {code}. This code expires in 10 minutes.\n\n"
        "If you did not create a VireSend account, ignore this email."
    )
    message.add_alternative(verification_email_html(full_name, code), subtype="html")

    context = ssl.create_default_context()

    if not Config.SMTP_USE_SSL:
        raise RuntimeError("SMTP_USE_SSL must be true for the configured Private Email SMTP connection.")

    with smtplib.SMTP_SSL(Config.SMTP_HOST, Config.SMTP_PORT, context=context, timeout=20) as smtp:
        smtp.login(Config.SMTP_USERNAME, Config.SMTP_PASSWORD)
        smtp.send_message(message)


def send_password_reset_email(to_email: str, full_name: str, reset_url: str) -> None:
    required = [Config.SMTP_HOST, Config.SMTP_USERNAME, Config.SMTP_PASSWORD, Config.SMTP_FROM]
    if not all(required):
        raise RuntimeError("SMTP is not configured.")

    message = EmailMessage()
    message["Subject"] = "Reset Your VireSend Password"
    message["From"] = Config.SMTP_FROM
    message["To"] = to_email
    message.set_content(
        f"Hello {full_name or 'there'},\n\n"
        "We received a request to reset your VireSend password.\n\n"
        f"Reset Password: {reset_url}\n\n"
        "This reset link expires in 30 minutes.\n\n"
        "If you did not request this password reset, you can safely ignore this email.\n\n"
        "(c) 2026 VireSend. All rights reserved."
    )
    message.add_alternative(password_reset_email_html(full_name, reset_url), subtype="html")

    context = ssl.create_default_context()

    if not Config.SMTP_USE_SSL:
        raise RuntimeError("SMTP_USE_SSL must be true for the configured Private Email SMTP connection.")

    with smtplib.SMTP_SSL(Config.SMTP_HOST, Config.SMTP_PORT, context=context, timeout=20) as smtp:
        smtp.login(Config.SMTP_USERNAME, Config.SMTP_PASSWORD)
        smtp.send_message(message)
