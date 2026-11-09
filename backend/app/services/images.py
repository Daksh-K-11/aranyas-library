"""Cover image validation, compression and GridFS storage."""
import io
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import MAX_UPLOAD_BYTES
from app.db.mongodb import get_covers_bucket

MAX_W, MAX_H = 600, 900
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "BMP", "MPO"}
# Refuse absurd dimensions before decoding (decompression bombs).
Image.MAX_IMAGE_PIXELS = 40_000_000


def compress_cover(raw: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(raw)) as img:
            if img.format not in ALLOWED_FORMATS:
                raise HTTPException(400, "Unsupported image type. Use JPEG, PNG or WebP.")
            img.seek(0)
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
            if img.mode == "RGBA":
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[-1])
                img = bg
            img.thumbnail((MAX_W, MAX_H), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            # Re-encoding drops EXIF/GPS metadata and any embedded payloads.
            img.save(out, format="WEBP", quality=75, method=6)
            return out.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise HTTPException(400, "The uploaded file is not a valid image")


async def read_upload(file: UploadFile) -> bytes:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Image is too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")
    if not data:
        raise HTTPException(400, "Empty file")
    return data


async def store_cover(file: UploadFile, owner_user_id: str) -> str:
    """Validate, compress and store. Returns the relative URL /covers/{id}."""
    raw = await read_upload(file)
    webp = compress_cover(raw)
    file_id = await get_covers_bucket().upload_from_stream(
        "cover.webp",
        webp,
        metadata={"owner_user_id": owner_user_id, "content_type": "image/webp"},
    )
    return f"/covers/{file_id}"


def cover_id_from_url(url: Optional[str]) -> Optional[ObjectId]:
    if not url or not url.startswith("/covers/"):
        return None
    raw = url[len("/covers/"):]
    return ObjectId(raw) if ObjectId.is_valid(raw) else None


async def delete_cover(url: Optional[str]) -> None:
    oid = cover_id_from_url(url)
    if oid is None:
        return
    try:
        await get_covers_bucket().delete(oid)
    except Exception:
        pass
