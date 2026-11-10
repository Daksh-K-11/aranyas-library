"""End-to-end smoke test against a running API.

    python scripts/smoke.py [base_url] [--cleanup]

Creates two throwaway users (smoke-*@example.com), exercises the main flows
and (with --cleanup) removes everything those users created.
"""
import asyncio
import io
import json
import secrets
import sys

import os

import httpx
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://localhost:8000")
CLEANUP = "--cleanup" in sys.argv

passed = failed = 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} {extra}")


async def user(c: httpx.AsyncClient, tag: str):
    email = f"smoke-{tag}-{secrets.token_hex(4)}@example.com"
    pw = "Sm0ke-test-pass"
    r = await c.post("/auth/register", json={"email": email, "password": pw, "name": tag})
    check(f"register {tag}", r.status_code == 201 and r.json().get("verification_required"), r.text)
    r = await c.post("/auth/login", json={"email": email, "password": pw})
    check(f"unverified login blocked {tag}", r.status_code == 403 and r.json().get("code") == "email_not_verified", r.text)
    await plant_code(email, "verify", "123456")
    r = await c.post("/auth/verify-email", json={"email": email, "code": "654321"})
    check(f"wrong code rejected {tag}", r.status_code == 400)
    r = await c.post("/auth/verify-email", json={"email": email, "code": "123456"})
    check(f"verify email {tag}", r.status_code == 200 and r.json().get("access_token"), r.text)
    r2 = await c.post("/auth/verify-email", json={"email": email, "code": "123456"})
    check(f"code is single use {tag}", r2.status_code == 400)
    token = r.json()["access_token"]
    return email, {"Authorization": f"Bearer {token}"}


async def plant_code(email: str, purpose: str, code: str):
    """Tests can't read the email, so store a known code the way the server would."""
    from datetime import datetime, timedelta, timezone

    from app.db.mongodb import otp_codes_collection
    from app.services.otp import _hash

    # let the background send task finish first so it doesn't overwrite us
    await asyncio.sleep(1.5)
    now = datetime.now(timezone.utc)
    await otp_codes_collection.update_one(
        {"email": email, "purpose": purpose},
        {"$set": {"code_hash": _hash(email, purpose, code), "attempts": 0, "created_at": now,
                  "expires_at": now + timedelta(minutes=10)}},
        upsert=True,
    )


def random_isbn():
    """A checksum-valid ISBN-13 that almost certainly doesn't exist."""
    from app.utils.isbn import isbn13_check_digit

    core = "9798" + "".join(secrets.choice("0123456789") for _ in range(8))
    return core + isbn13_check_digit(core)


def png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (1200, 1800), (30, 90, 160)).save(buf, format="JPEG")
    return buf.getvalue()


async def main():
    async with httpx.AsyncClient(base_url=BASE, timeout=40) as c:
        print("auth")
        r = await c.post("/auth/register", json={"email": "bad", "password": "x"})
        check("register validation", r.status_code == 422)
        r = await c.post("/auth/register", json={"email": "a@example.com", "password": "onlyletters"})
        check("password rules", r.status_code == 422)
        r = await c.get("/books")
        check("books requires auth", r.status_code == 401)
        r = await c.get("/books", headers={"Authorization": "Bearer garbage"})
        check("garbage token 401 generic", r.status_code == 401 and r.json()["detail"] == "Could not validate credentials")

        email_a, A = await user(c, "a")
        email_b, B = await user(c, "b")
        r = await c.get("/auth/me", headers=A)
        check("me", r.status_code == 200 and r.json()["email"] == email_a)

        print("password reset")
        r = await c.post("/auth/forgot-password", json={"email": "nobody-" + secrets.token_hex(3) + "@example.com"})
        check("forgot unknown email is generic", r.status_code == 202)
        r = await c.post("/auth/forgot-password", json={"email": email_b})
        check("forgot known email same response", r.status_code == 202)
        await plant_code(email_b, "reset", "111111")
        for _ in range(5):
            await c.post("/auth/reset-password", json={"email": email_b, "code": "999999", "new_password": "New-pass-123"})
        r = await c.post("/auth/reset-password", json={"email": email_b, "code": "111111", "new_password": "New-pass-123"})
        check("code locked after 5 wrong attempts", r.status_code == 400, r.text)
        await plant_code(email_b, "reset", "222222")
        r = await c.post("/auth/reset-password", json={"email": email_b, "code": "222222", "new_password": "short"})
        check("reset enforces password rules", r.status_code == 422)
        r = await c.post("/auth/reset-password", json={"email": email_b, "code": "222222", "new_password": "New-pass-123"})
        check("reset password", r.status_code == 200 and r.json().get("access_token"), r.text)
        r_old = await c.get("/auth/me", headers=B)
        check("old sessions revoked after reset", r_old.status_code == 401)
        B = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = await c.post("/auth/login", json={"email": email_b, "password": "New-pass-123"})
        check("login with new password", r.status_code == 200)
        r = await c.post("/auth/register", json={"email": email_a, "password": "Other-pass-1"})
        check("re-register verified email is generic", r.status_code == 201)
        r = await c.post("/auth/login", json={"email": email_a, "password": "Other-pass-1"})
        check("re-register did not change password", r.status_code == 401)

        print("isbn lookup")
        r = await c.get("/isbn", params={"isbn": "978-0-451-52493-6"}, headers=A)
        check("bad checksum 400", r.status_code == 400, r.text)
        r = await c.get("/isbn", params={"isbn": "9788129115300"}, headers=A)
        check("lookup known isbn", r.status_code == 200 and r.json().get("title"), r.text[:300])
        book_2states = r.json()
        print("     ->", book_2states.get("title"), book_2states.get("authors"), book_2states.get("sources"))
        manual_isbn = random_isbn()
        r = await c.get("/isbn", params={"isbn": manual_isbn}, headers=A)
        check("unknown isbn 404 manual_allowed", r.status_code == 404 and r.json().get("manual_allowed") is True, r.text[:300])
        r = await c.get("/isbn/search", params={"q": "the hobbit tolkien"}, headers=A)
        check("title search", r.status_code == 200 and len(r.json()["items"]) > 0, r.text[:200])

        print("libraries")
        r = await c.post("/library", json={"name": "  Smoke Shelf  ", "is_public": True}, headers=A)
        check("create library", r.status_code == 201, r.text)
        lib = r.json()["library"]
        r = await c.post("/library", json={"name": "   "}, headers=A)
        check("empty library name rejected", r.status_code == 422)

        print("add books")
        r = await c.post("/books", json={"book_id": book_2states["id"], "genres": ["Romance"], "rating": 4,
                                          "library_ids": [lib["id"]]}, headers=A)
        check("add by book_id", r.status_code == 201 and r.json()["created"], r.text[:300])
        ub_2states = r.json()["item"]["user_book_id"]
        r = await c.post("/books", json={"book_id": book_2states["id"]}, headers=A)
        check("add twice is idempotent", r.status_code == 201 and not r.json()["created"])

        data = {"title": "Smoke Manual Book", "authors": ["Tester, Some"], "isbn": manual_isbn,
                "description": "OCR text", "genres": ["Test"], "library_ids": [lib["id"]]}
        r = await c.post("/books/manual", data={"data": json.dumps(data)},
                         files={"cover": ("c.jpg", png_bytes(), "image/jpeg")}, headers=A)
        check("manual with isbn + cover", r.status_code == 201, r.text[:300])
        shared_item = r.json()["item"]
        cover_url = shared_item["book"]["cover_url"]
        check("cover stored as /covers/", cover_url and cover_url.startswith("/covers/"), cover_url)
        r = await c.get(cover_url)
        check("cover served as webp", r.status_code == 200 and r.headers["content-type"] == "image/webp"
              and len(r.content) < 200_000, f"{r.status_code} {len(r.content)}")
        r = await c.post("/books/manual", data={"data": json.dumps({"title": "Private Zine", "authors": ["Me"]})},
                         headers=A)
        check("manual without isbn", r.status_code == 201 and r.json()["item"]["book"]["is_private"], r.text[:200])
        private_book_id = r.json()["item"]["book"]["id"]
        r = await c.post("/books/manual", data={"data": json.dumps({"title": "x", "isbn": "123"})}, headers=A)
        check("manual bad isbn 400", r.status_code == 400)
        r = await c.post("/covers", files={"file": ("x.jpg", b"not an image", "image/jpeg")}, headers=A)
        check("non-image upload rejected", r.status_code == 400)

        print("shared catalog + overrides")
        r = await c.get("/isbn", params={"isbn": manual_isbn}, headers=B)
        check("B finds user-submitted isbn", r.status_code == 200 and r.json()["title"] == "Smoke Manual Book", r.text[:200])
        r = await c.post("/books", json={"book_id": r.json()["id"]}, headers=B)
        ub_b = r.json()["item"]["user_book_id"]
        r = await c.patch(f"/books/{ub_b}", json={"overrides": {"title": "B's Better Title"}}, headers=B)
        check("B override", r.status_code == 200 and r.json()["book"]["title"] == "B's Better Title" and r.json()["has_overrides"], r.text[:300])
        r = await c.get(f"/books/{shared_item['user_book_id']}", headers=A)
        check("A unaffected by B override", r.json()["book"]["title"] == "Smoke Manual Book")
        r = await c.post("/books", json={"book_id": private_book_id}, headers=B)
        check("B cannot add A's private book", r.status_code == 404)
        r = await c.patch(f"/books/{ub_b}", json={"reset_overrides": True}, headers=B)
        check("reset overrides", r.json()["book"]["title"] == "Smoke Manual Book" and not r.json()["has_overrides"])
        r = await c.patch(f"/books/{ub_2states}", json={"rating": None, "read_status": "reading"}, headers=A)
        check("clear rating", r.status_code == 200 and r.json()["rating"] is None, r.text[:200])

        print("ownership")
        r = await c.request("DELETE", "/books", json={"user_book_ids": [ub_2states]}, headers=B)
        check("B can't delete A's book", r.status_code == 404)
        r = await c.post(f"/librarybooks/{lib['id']}", json={"user_book_ids": [ub_b]}, headers=B)
        check("B can't add to A's library", r.status_code == 404)
        r = await c.post(f"/library", json={"name": "B lib"}, headers=B)
        lib_b = r.json()["library"]
        r = await c.post(f"/librarybooks/{lib_b['id']}", json={"user_book_ids": [ub_2states]}, headers=B)
        check("B can't add A's book to B's library", r.status_code == 404)
        r = await c.get(f"/librarybooks/{lib['id']}", headers=B)
        check("B can't view A's library", r.status_code == 404)
        r = await c.patch("/books/not-an-id", json={}, headers=A)
        check("invalid id 400", r.status_code == 400)

        print("pagination")
        r = await c.get("/books", params={"page": 1, "page_size": 2, "sort": "title", "order": "asc"}, headers=A)
        j = r.json()
        check("page 1", r.status_code == 200 and j["total"] == 3 and len(j["items"]) == 2 and j["total_pages"] == 2, r.text[:300])
        r = await c.get("/books", params={"page": 2, "page_size": 2, "sort": "title", "order": "asc"}, headers=A)
        check("page 2", len(r.json()["items"]) == 1)
        r = await c.get("/books", params={"q": "zine"}, headers=A)
        check("search", r.json()["total"] == 1)
        r = await c.get(f"/librarybooks/{lib['id']}", params={"page_size": 1}, headers=A)
        check("library pagination", r.json()["total"] == 2 and len(r.json()["items"]) == 1, r.text[:300])
        r = await c.get("/books/facets", headers=A)
        check("facets", "Romance" in r.json()["genres"])
        r = await c.get("/library", headers=A)
        check("library book_count", r.json()[0]["book_count"] == 2, r.text[:300])

        print("public")
        slug = lib["slug"]
        r = await c.get(f"/public/library/{slug}")
        j = r.json()
        check("public works", r.status_code == 200 and j["total"] == 2, r.text[:300])
        leaked = {"rating", "read_status", "personal_notes", "tags", "user_book_id"} & set(j["items"][0].keys())
        check("public hides private fields", not leaked, str(leaked))
        r = await c.get(f"/public/library/{slug}", params={"q": "states"})
        check("public search", r.json()["total"] == 1)
        r = await c.patch(f"/library/{lib['id']}", json={"name": "Renamed Shelf"}, headers=A)
        check("slug stable after rename", r.json()["library"]["slug"] == slug)
        r = await c.patch(f"/library/{lib['id']}", json={"is_public": False}, headers=A)
        r = await c.get(f"/public/library/{slug}")
        check("private -> 404", r.status_code == 404)
        r = await c.post(f"/library/{lib['id']}/regenerate-link", headers=A)
        check("regenerate link", r.json()["library"]["slug"] != slug)

        print("delete")
        r = await c.request("DELETE", "/books", json={"user_book_ids": [ub_2states]}, headers=A)
        check("delete own", r.status_code == 200)
        r = await c.get("/library", headers=A)
        check("library count updated", r.json()[0]["book_count"] == 1)

        if CLEANUP:
            for H in (A, B):
                r = await c.get("/books", params={"page_size": 60}, headers=H)
                ids = [i["user_book_id"] for i in r.json()["items"]]
                if ids:
                    await c.request("DELETE", "/books", json={"user_book_ids": ids}, headers=H)
                for l in (await c.get("/library", headers=H)).json():
                    await c.delete(f"/library/{l['id']}", headers=H)
            print("cleanup: removed books and libraries (users + shared test book removed by cleanup_db)")
            await cleanup_db([email_a, email_b], manual_isbn)

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


async def cleanup_db(emails, manual_isbn):
    import os

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from app.db.mongodb import books_collection, get_covers_bucket, isbn_misses_collection, users_collection

    b = await books_collection.find_one({"isbn_13": manual_isbn, "source": "user_submitted"})
    if b:
        if (b.get("cover_url") or "").startswith("/covers/"):
            from bson import ObjectId

            try:
                await get_covers_bucket().delete(ObjectId(b["cover_url"].split("/")[-1]))
            except Exception:
                pass
        await books_collection.delete_one({"_id": b["_id"]})
    await isbn_misses_collection.delete_many({"isbn_13": manual_isbn})
    from app.db.mongodb import otp_codes_collection, otp_sends_collection

    await otp_codes_collection.delete_many({"email": {"$in": emails}})
    await otp_sends_collection.delete_many({"email": {"$in": emails}})
    await users_collection.delete_many({"email": {"$in": emails}})


if __name__ == "__main__":
    asyncio.run(main())
