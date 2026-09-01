import requests
from werkzeug.utils import secure_filename

from config import Config


class CloudflareImageError(Exception):
    pass


def upload_image(content: bytes, filename: str, content_type: str) -> dict:
    if not Config.CLOUDFLARE_ACCOUNT_ID or not Config.CLOUDFLARE_IMAGES_API_TOKEN or not Config.CLOUDFLARE_IMAGES_DELIVERY_HASH:
        raise CloudflareImageError("Cloudflare Images upload is not configured.")
    try:
        direct_response = requests.post(
            f"https://api.cloudflare.com/client/v4/accounts/{Config.CLOUDFLARE_ACCOUNT_ID}/images/v2/direct_upload",
            headers={"Authorization": f"Bearer {Config.CLOUDFLARE_IMAGES_API_TOKEN}"},
            timeout=20,
        )
        direct_data = direct_response.json()
    except (requests.RequestException, ValueError) as exc:
        raise CloudflareImageError("Cloudflare image upload is temporarily unavailable.") from exc
    direct_result = direct_data.get("result") if isinstance(direct_data, dict) else None
    if not direct_response.ok or not direct_data.get("success") or not isinstance(direct_result, dict):
        raise CloudflareImageError("Cloudflare could not prepare the image upload.")
    upload_url = direct_result.get("uploadURL")
    image_id = direct_result.get("id")
    if not upload_url or not image_id:
        raise CloudflareImageError("Cloudflare did not return a valid direct upload URL.")
    try:
        upload_response = requests.post(
            upload_url,
            files={"file": (secure_filename(filename), content, content_type or "application/octet-stream")},
            timeout=60,
        )
        upload_data = upload_response.json()
    except (requests.RequestException, ValueError) as exc:
        raise CloudflareImageError("Cloudflare image upload is temporarily unavailable.") from exc
    if not upload_response.ok or not upload_data.get("success"):
        raise CloudflareImageError("Cloudflare could not upload this image.")
    variant = Config.CLOUDFLARE_IMAGES_VARIANT or "public"
    url = f"https://imagedelivery.net/{Config.CLOUDFLARE_IMAGES_DELIVERY_HASH}/{image_id}/{variant}"
    return {"id": image_id, "url": url, "variant": variant}
