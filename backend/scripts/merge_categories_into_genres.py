"""Fold book categories into genres, for every book.

    python scripts/merge_categories_into_genres.py            # dry run: print what would change
    python scripts/merge_categories_into_genres.py --apply    # write the changes
    python scripts/merge_categories_into_genres.py --restore <backup_collection>

For each of a user's books the new genre list is:
  1. the genres they already set, with common spellings unified
     ("sci-fi" -> "Science Fiction"; custom genres are kept as written),
  2. categories the user typed themselves (their own private or submitted
     books, or their personal edits of a catalogue book), unified the same way,
  3. up to 3 preset genres suggested by the catalogue's subject headings.
Nothing the user chose is removed. The user's category edits are then
dropped, since genres now hold them.

Catalogue books get their subject lists cleaned of catalogue noise
("Accessible book", "nyt:..."). Those subjects stay in the database: they
drive genre suggestions and search.

Every changed document is copied to a backup collection first, so --restore
can put things back exactly.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.mongodb import books_collection, db, user_books_collection  # noqa: E402
from app.services.genres import clean_subjects, normalize_genre, suggest_from_subjects  # noqa: E402
from app.utils.search import build_search_blob, merged_book  # noqa: E402
from app.utils.text import dedupe  # noqa: E402

APPLY = "--apply" in sys.argv


def new_genres(user_book: dict, book: dict) -> list:
    overrides = user_book.get("overrides") or {}
    user_id = user_book.get("user_id")
    typed_by_user = book.get("owner_user_id") == user_id or book.get("created_by") == user_id

    own_categories = list(overrides.get("categories") or [])
    if typed_by_user:
        own_categories += book.get("categories") or []
    subjects = overrides.get("categories") or book.get("categories") or []

    combined = [normalize_genre(g) for g in (user_book.get("genres") or []) + own_categories]
    combined += suggest_from_subjects(subjects)["genres"]
    return dedupe(combined, 30, 40)


async def migrate():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = db[f"backup_genres_{stamp}"]

    # ---- catalogue subjects
    books = {}
    book_changes = 0
    async for b in books_collection.find({}):
        cleaned = clean_subjects(b.get("categories") or [], 10)
        if cleaned != (b.get("categories") or []):
            book_changes += 1
            if APPLY:
                await backup.insert_one({"kind": "book", "doc_id": b["_id"], "categories": b.get("categories")})
                await books_collection.update_one({"_id": b["_id"]}, {"$set": {"categories": cleaned}})
            b["categories"] = cleaned
        books[b["_id"]] = b

    # ---- each user's copy
    changed = unchanged = 0
    async for ub in user_books_collection.find({}):
        book = books.get(ub.get("book_id")) or {}
        genres = new_genres(ub, book)
        overrides = dict(ub.get("overrides") or {})
        had_categories = overrides.pop("categories", None) is not None

        if genres == (ub.get("genres") or []) and not had_categories:
            unchanged += 1
            continue
        changed += 1
        print(f"- {(book.get('title') or '?')[:50]!r}")
        print(f"    {ub.get('genres') or []}  ->  {genres}")

        if APPLY:
            await backup.insert_one(
                {"kind": "user_book", "doc_id": ub["_id"], "genres": ub.get("genres"), "overrides": ub.get("overrides")}
            )
            user_data = {**ub, "genres": genres}
            update = {
                "$set": {"genres": genres, "search_blob": build_search_blob(merged_book(book, overrides), user_data)},
            }
            if had_categories:
                if overrides:
                    update["$set"]["overrides"] = overrides
                else:
                    update["$unset"] = {"overrides": ""}
            await user_books_collection.update_one({"_id": ub["_id"]}, update)

    print()
    print(f"Catalogue books with cleaned subjects: {book_changes} of {len(books)}")
    print(f"User books with new genres: {changed} (unchanged: {unchanged})")
    if APPLY:
        print(f"Backup collection: {backup.name}  (undo with --restore {backup.name})")
    else:
        print("Dry run. Nothing was written. Re-run with --apply to save.")


async def restore(name: str):
    backup = db[name]
    n = 0
    async for row in backup.find({}):
        if row["kind"] == "book":
            await books_collection.update_one({"_id": row["doc_id"]}, {"$set": {"categories": row["categories"]}})
        else:
            update = {"$set": {"genres": row.get("genres") or []}}
            if row.get("overrides"):
                update["$set"]["overrides"] = row["overrides"]
            else:
                update["$unset"] = {"overrides": ""}
            await user_books_collection.update_one({"_id": row["doc_id"]}, update)
        n += 1
    print(f"Restored {n} documents from {name}. Search text refreshes the next time each book is edited.")


if __name__ == "__main__":
    if "--restore" in sys.argv:
        asyncio.run(restore(sys.argv[sys.argv.index("--restore") + 1]))
    else:
        asyncio.run(migrate())
