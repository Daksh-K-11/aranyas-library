"""Manually create indexes (they are also ensured on app startup)."""
import asyncio

from app.db.indexes import ensure_indexes

if __name__ == "__main__":
    asyncio.run(ensure_indexes())
    print("Indexes ensured")
