from dataclasses import dataclass

import phonenumbers
from flask import current_app
from phonenumbers import PhoneNumberFormat, PhoneNumberType, carrier, geocoder

from utils.security import clean_string, now_utc


GHANA_COUNTRY_CODE = "GH"
GSM_7_BASIC = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
GSM_7_EXTENDED = set("^{}\\[~]|€")


class SmsRoutingError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class PhoneDestination:
    original: str
    e164: str
    provider_recipient: str
    country_code: str
    country_name: str
    dial_code: str
    international: bool

    def as_dict(self):
        return {
            "recipient_original": self.original,
            "recipient_normalized": self.e164,
            "provider_recipient": self.provider_recipient,
            "country_code": self.country_code,
            "country_name": self.country_name,
            "country_dial_code": self.dial_code,
            "international": self.international,
        }


def parse_phone_number(value, default_country="GH") -> PhoneDestination:
    original = clean_string(str(value or ""))
    if not original:
        raise SmsRoutingError("invalid_phone_number", "Enter a valid recipient phone number.")
    candidate = original
    if candidate.startswith("233") and not candidate.startswith("+"):
        candidate = f"+{candidate}"
    try:
        parsed = phonenumbers.parse(candidate, None if candidate.startswith("+") else default_country)
    except phonenumbers.NumberParseException as exc:
        raise SmsRoutingError("invalid_phone_number", "Enter a valid recipient phone number.") from exc
    number_type = phonenumbers.number_type(parsed)
    if not phonenumbers.is_possible_number(parsed) or number_type == PhoneNumberType.FIXED_LINE:
        raise SmsRoutingError("invalid_phone_number", "Enter a valid mobile phone number.")
    region = phonenumbers.region_code_for_number(parsed) or phonenumbers.region_code_for_country_code(parsed.country_code) or ""
    if not region:
        raise SmsRoutingError("unsupported_country", "SMS sending to this destination is currently unavailable.")
    e164 = phonenumbers.format_number(parsed, PhoneNumberFormat.E164)
    dial_code = f"+{parsed.country_code}"
    country_name = geocoder.country_name_for_number(parsed, "en") or region
    return PhoneDestination(
        original=original,
        e164=e164,
        provider_recipient=e164[1:],
        country_code=region,
        country_name=country_name,
        dial_code=dial_code,
        international=region != GHANA_COUNTRY_CODE,
    )


def try_parse_phone_number(value, default_country="GH"):
    try:
        return parse_phone_number(value, default_country)
    except SmsRoutingError:
        return None


def normalize_phone_number(value, default_country="GH"):
    destination = try_parse_phone_number(value, default_country)
    return destination.e164 if destination else None


def sms_segments(message: str) -> dict:
    text = message or ""
    gsm_units = 0
    gsm7 = True
    for character in text:
        if character in GSM_7_BASIC:
            gsm_units += 1
        elif character in GSM_7_EXTENDED:
            gsm_units += 2
        else:
            gsm7 = False
            break
    if gsm7:
        single_limit, multipart_limit, length, encoding = 160, 153, gsm_units, "GSM-7"
    else:
        single_limit, multipart_limit, length, encoding = 70, 67, len(text.encode("utf-16-be")) // 2, "UCS-2"
    parts = 1 if length <= single_limit else max(1, (length + multipart_limit - 1) // multipart_limit)
    return {"parts": parts, "encoding": encoding, "character_units": length, "single_limit": single_limit, "multipart_limit": multipart_limit}


def international_pricing_collection():
    return current_app.config["DB"].international_sms_pricing


def safe_pricing_rule(rule: dict) -> dict:
    return {
        "id": str(rule.get("_id")) if rule.get("_id") else None,
        "provider": "bird",
        "country_code": rule.get("country_code", ""),
        "country_name": rule.get("country_name", ""),
        "dial_code": rule.get("dial_code", ""),
        "provider_cost": float(rule.get("provider_cost", 0) or 0),
        "provider_currency": rule.get("provider_currency", "USD"),
        "exchange_rate_to_ghs": float(rule.get("exchange_rate_to_ghs", 1) or 1),
        "user_price_ghs": float(rule.get("user_price_ghs", 0) or 0),
        "enabled": bool(rule.get("enabled", False)),
        "shared_sender": bool(rule.get("shared_sender", False)),
        "updated_at": rule.get("updated_at").isoformat() if rule.get("updated_at") else None,
    }


def get_international_pricing(country_code: str, require_enabled=True) -> dict:
    code = clean_string(country_code).upper()
    rule = international_pricing_collection().find_one({"provider": "bird", "country_code": code})
    if not rule or float(rule.get("user_price_ghs", 0) or 0) <= 0:
        raise SmsRoutingError("destination_not_priced", "SMS sending to this destination is currently unavailable.")
    if require_enabled and not rule.get("enabled", False):
        raise SmsRoutingError("destination_disabled", "SMS sending to this destination is currently unavailable.")
    return safe_pricing_rule(rule)


def save_international_pricing(data: dict, admin_id: str) -> dict:
    code = clean_string(data.get("country_code", "")).upper()
    if len(code) != 2:
        raise SmsRoutingError("invalid_country", "Select a valid country.")
    try:
        country_calling_code = phonenumbers.country_code_for_region(code)
        provider_cost = round(float(data.get("provider_cost", 0) or 0), 6)
        user_price = round(float(data.get("user_price_ghs", 0) or 0), 4)
        exchange_rate = round(float(data.get("exchange_rate_to_ghs", 1) or 1), 6)
    except (TypeError, ValueError):
        raise SmsRoutingError("invalid_pricing", "Enter valid international SMS pricing.")
    if not country_calling_code or provider_cost < 0 or user_price < 0 or exchange_rate <= 0:
        raise SmsRoutingError("invalid_pricing", "Enter valid international SMS pricing.")
    country_name = geocoder.country_name_for_number(phonenumbers.PhoneNumber(country_code=country_calling_code), "en") or code
    existing = international_pricing_collection().find_one({"provider": "bird", "country_code": code}) or {}
    update = {
        "provider": "bird",
        "country_code": code,
        "country_name": clean_string(data.get("country_name", "")) or country_name,
        "dial_code": clean_string(data.get("dial_code", "")) or f"+{country_calling_code}",
        "provider_cost": provider_cost,
        "provider_currency": clean_string(data.get("provider_currency", "USD")).upper() or "USD",
        "exchange_rate_to_ghs": exchange_rate,
        "user_price_ghs": user_price,
        "enabled": bool(data.get("enabled", False)),
        "shared_sender": bool(data.get("shared_sender", existing.get("shared_sender", False))) if code != GHANA_COUNTRY_CODE else False,
        "updated_by": admin_id,
        "updated_at": now_utc(),
    }
    international_pricing_collection().update_one(
        {"provider": "bird", "country_code": code},
        {"$set": update, "$setOnInsert": {"created_at": now_utc()}},
        upsert=True,
    )
    return safe_pricing_rule(international_pricing_collection().find_one({"provider": "bird", "country_code": code}))


def build_recipient_plan(recipients, message: str, settings: dict) -> dict:
    segment = sms_segments(message)
    items, invalid = [], []
    seen = set()
    for value in recipients:
        try:
            destination = parse_phone_number(value)
        except SmsRoutingError:
            invalid.append(clean_string(str(value or "")))
            continue
        if destination.e164 in seen:
            continue
        seen.add(destination.e164)
        if destination.international:
            pricing = get_international_pricing(destination.country_code)
            provider = "bird"
            user_price = pricing["user_price_ghs"]
            provider_cost = pricing["provider_cost"] * pricing["exchange_rate_to_ghs"]
            provider_currency = pricing["provider_currency"]
            shared_sender = pricing.get("shared_sender", False)
        else:
            provider = settings.get("active_sms_provider", "arkesel")
            user_price = float(settings.get("sms_cost_per_message", 0) or 0)
            provider_cost = float(settings.get("sms_provider_cost_per_message", 0) or 0)
            provider_currency = "GHS"
            shared_sender = False
        charge = round(user_price * segment["parts"], 4)
        cost = round(provider_cost * segment["parts"], 4)
        items.append({**destination.as_dict(), "provider": provider, "shared_sender": shared_sender, "requires_sender_id": not shared_sender, "sms_parts": segment["parts"], "encoding": segment["encoding"], "user_price_ghs": user_price, "user_charge": charge, "provider_cost": cost, "provider_currency": provider_currency, "profit": round(charge - cost, 4)})
    if not items:
        raise SmsRoutingError("no_valid_recipients", "Add at least one valid recipient.")
    groups = {}
    for item in items:
        groups.setdefault(item["provider"], []).append(item)
    return {
        "recipients": items,
        "invalid_recipients": invalid,
        "recipient_count": len(items),
        "sms_parts": segment["parts"],
        "sms_units": sum(item["sms_parts"] for item in items),
        "encoding": segment["encoding"],
        "total_cost": round(sum(item["user_charge"] for item in items), 4),
        "provider_total_cost": round(sum(item["provider_cost"] for item in items), 4),
        "groups": groups,
        "international": any(item["international"] for item in items),
        "countries": sorted({item["country_code"] for item in items}),
    }
