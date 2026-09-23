import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.cloudflare_images_service import upload_image


class CloudflareImagesServiceTests(unittest.TestCase):
    def test_direct_upload_uses_returned_url_and_delivery_hash(self):
        direct = Mock(ok=True)
        direct.json.return_value = {"success": True, "result": {"id": "image-123", "uploadURL": "https://upload.imagedelivery.net/direct"}}
        uploaded = Mock(ok=True)
        uploaded.json.return_value = {"success": True, "result": {"id": "image-123"}}
        with patch("services.cloudflare_images_service.Config.CLOUDFLARE_ACCOUNT_ID", "account-1"), \
             patch("services.cloudflare_images_service.Config.CLOUDFLARE_IMAGES_API_TOKEN", "token-1"), \
             patch("services.cloudflare_images_service.Config.CLOUDFLARE_IMAGES_DELIVERY_HASH", "delivery-hash"), \
             patch("services.cloudflare_images_service.Config.CLOUDFLARE_IMAGES_VARIANT", "public"), \
             patch("services.cloudflare_images_service.requests.post", side_effect=[direct, uploaded]) as post:
            result = upload_image(b"image-bytes", "cover image.png", "image/png")
        self.assertEqual(post.call_count, 2)
        self.assertIn("/images/v2/direct_upload", post.call_args_list[0].args[0])
        self.assertEqual(post.call_args_list[1].args[0], "https://upload.imagedelivery.net/direct")
        self.assertEqual(post.call_args_list[1].kwargs["files"]["file"][0], "cover_image.png")
        self.assertEqual(result["url"], "https://imagedelivery.net/delivery-hash/image-123/public")


if __name__ == "__main__":
    unittest.main()
