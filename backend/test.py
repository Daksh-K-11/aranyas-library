"""Bulk-add sample books. Usage:

    set TEST_TOKEN=<bearer token> && python test.py [base_url]
"""
import os
import sys

import requests

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
TOKEN = os.environ.get("TEST_TOKEN")
if not TOKEN:
    sys.exit("Set TEST_TOKEN to a bearer token first")

HEADERS = {"Authorization": f"Bearer {TOKEN}"}

BOOKS = [
    ("9780451524935", {"genres": ["dystopian"], "rating": 5, "read_status": "completed"}),
    ("9780441172719", {"genres": ["science fiction"], "rating": 5, "read_status": "completed"}),
    ("9780061120084", {"genres": ["classic"], "rating": 5, "read_status": "completed"}),
]

for isbn, payload in BOOKS:
    r = requests.get(f"{BASE_URL}/isbn", params={"isbn": isbn}, headers=HEADERS, timeout=30)
    if r.status_code != 200:
        print(isbn, "lookup failed:", r.status_code, r.text[:200])
        continue
    book = r.json()
    r = requests.post(f"{BASE_URL}/books", json={"book_id": book["id"], **payload}, headers=HEADERS, timeout=30)
    print(isbn, book["title"], "->", r.status_code)
