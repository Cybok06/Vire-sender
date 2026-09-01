import requests

ARKESEL_SEND_URL = "https://sms.arkesel.com/api/v2/sms/send"


def send_sms(api_key: str, sender: str, message: str, recipients: list[str], timeout: int = 30) -> dict:
    if not api_key:
        return {"success": False, "message": "Arkesel API key is not configured."}
    if not recipients:
        return {"success": False, "message": "At least one recipient is required."}

    try:
        response = requests.post(
            ARKESEL_SEND_URL,
            headers={
                "Content-Type": "application/json",
                "api-key": api_key,
            },
            json={
                "sender": sender,
                "message": message,
                "recipients": recipients,
            },
            timeout=timeout,
        )
        data = response.json() if response.content else {}
    except requests.Timeout:
        return {"success": False, "message": "Arkesel request timed out."}
    except requests.RequestException:
        return {"success": False, "message": "Unable to reach Arkesel SMS service."}
    except ValueError:
        data = {}

    if not response.ok:
        return {
            "success": False,
            "message": data.get("message") or "Arkesel rejected the SMS request.",
            "provider_response": data,
        }

    if data.get("status") is False or str(data.get("code", "")).startswith("4"):
        return {
            "success": False,
            "message": data.get("message") or "Arkesel could not send this SMS.",
            "provider_response": data,
        }

    return {
        "success": True,
        "message": data.get("message") or "SMS accepted by Arkesel.",
        "provider_response": data,
    }
