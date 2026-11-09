import io

import pytest
from fastapi import HTTPException
from PIL import Image

from app.services.images import compress_cover


def _png(w, h):
    buf = io.BytesIO()
    Image.new("RGBA", (w, h), (200, 10, 10, 128)).save(buf, format="PNG")
    return buf.getvalue()


def test_compress_resizes_to_webp():
    out = compress_cover(_png(2400, 3600))
    img = Image.open(io.BytesIO(out))
    assert img.format == "WEBP"
    assert img.width <= 600 and img.height <= 900


def test_rejects_non_image():
    with pytest.raises(HTTPException) as e:
        compress_cover(b"<script>alert(1)</script>")
    assert e.value.status_code == 400
