from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from gridfs.errors import NoFile

from app.auth.deps import get_current_user
from app.core.ratelimit import limiter
from app.db.mongodb import get_covers_bucket
from app.services.images import store_cover
from app.utils.ids import parse_oid

router = APIRouter(prefix="/covers", tags=["Covers"])


@router.post("", status_code=201)
@limiter.limit("20/minute;200/day")
async def upload_cover(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    url = await store_cover(file, user_id)
    return {"cover_url": url}


@router.get("/{cover_id}")
async def get_cover(cover_id: str):
    oid = parse_oid(cover_id, "cover id")
    try:
        stream = await get_covers_bucket().open_download_stream(oid)
    except NoFile:
        raise HTTPException(404, "Cover not found")
    data = await stream.read()
    return Response(
        content=data,
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
        },
    )
