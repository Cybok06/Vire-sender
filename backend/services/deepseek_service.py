import json
import re

try:
    from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI
except ImportError:
    OpenAI = None

    class APITimeoutError(Exception):
        pass

    class APIConnectionError(Exception):
        pass

    class APIStatusError(Exception):
        status_code = 502

from config import Config


class DeepSeekServiceError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def deepseek_available() -> bool:
    return bool(Config.AI_ENABLED and Config.DEEPSEEK_API_KEY and OpenAI is not None)


def strip_code_fence(value: str) -> str:
    text = (value or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def parse_json_content(value: str) -> dict:
    text = strip_code_fence(value)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise
        parsed = json.loads(text[start:end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("DeepSeek response was not a JSON object.")
    return parsed


def create_client():
    if OpenAI is None:
        raise DeepSeekServiceError("AI Assist dependencies are not installed.", 503)
    if not Config.DEEPSEEK_API_KEY:
        raise DeepSeekServiceError("AI Assist is not configured yet.", 503)
    return OpenAI(
        api_key=Config.DEEPSEEK_API_KEY,
        base_url=Config.DEEPSEEK_BASE_URL,
        timeout=30,
    )


def chat_completion(messages, *, temperature=0.2, max_tokens=1200, model=None) -> str:
    client = create_client()
    try:
        response = client.chat.completions.create(
            model=model or Config.DEEPSEEK_MODEL or "deepseek-chat",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except APITimeoutError:
        raise DeepSeekServiceError("DeepSeek timed out. Please try again.", 504)
    except APIStatusError as exc:
        status = getattr(exc, "status_code", 502) or 502
        if status == 401:
            message = "DeepSeek API key is invalid."
        elif status == 429:
            message = "DeepSeek rate limit reached. Please try again shortly."
        else:
            message = "DeepSeek could not complete this request right now."
        raise DeepSeekServiceError(message, status)
    except APIConnectionError:
        raise DeepSeekServiceError("Could not connect to DeepSeek. Please try again.", 502)
    except Exception:
        raise DeepSeekServiceError("AI Assist failed. Please try again.", 502)
    return (response.choices[0].message.content or "") if response.choices else ""


def chat_json(messages, *, temperature=0.1, max_tokens=1200, model=None) -> dict:
    content = chat_completion(messages, temperature=temperature, max_tokens=max_tokens, model=model)
    try:
        return parse_json_content(content)
    except Exception as exc:
        raise DeepSeekServiceError(f"DeepSeek returned an unexpected response: {exc}", 502)
