import requests

BASE_URL = "http://localhost:8000/books"
# BASE_URL = "http://localhost:8000/isbn?isbn="

# 🔐 PASTE YOUR TOKEN HERE
BEARER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNjk1Mjc3MWIyY2NlOTQyMWQwYWJlZDFjIiwiZXhwIjoxNzcyOTYwODU2fQ.Xg8xX7YV-zl5u4Y9MKFCJku7VPYt-8ZaWuBdiB4U-aA"

HEADERS = {
    "Authorization": f"Bearer {BEARER_TOKEN}",
    "Content-Type": "application/json",
}

# First 10 books with ISBN-13 and custom payloads
books = [
    {
        "isbn": "9780451524935",
        "payload": {
            "genres": ["dystopian", "science fiction"],
            "tags": ["surveillance", "propaganda"],
            "personal_notes": "Chilling vision of authoritarian control",
            "rating": 5,
            "read_status": "completed"
        }
    },
    {
        "isbn": "9780441172719",
        "payload": {
            "genres": ["science fiction"],
            "tags": ["desert", "prophecy"],
            "personal_notes": "Massive scope and deep lore",
            "rating": 5,
            "read_status": "completed"
        }
    },
    {
        "isbn": "9780307387899",
        "payload": {
            "genres": ["science fiction", "literary fiction"],
            "tags": ["memory", "time travel"],
            "personal_notes": "Beautifully written time-travel story",
            "rating": 5,
            "read_status": "completed"
        }
    },
    {
        "isbn": "9780385490818",
        "payload": {
            "genres": ["science fiction"],
            "tags": ["virtual reality", "cyberspace"],
            "personal_notes": "Cyberpunk classic",
            "rating": 4,
            "read_status": "completed"
        }
    },
    {
        "isbn": "9780140283334",
        "payload": {
            "genres": ["classic", "philosophical"],
            "tags": ["plague", "existence"],
            "personal_notes": "Existential themes during crisis",
            "rating": 5,
            "read_status": "completed"
        }
    },
    {
        "isbn": "9780553293357",
        "payload": {
            "genres": ["science fiction"],
            "tags": ["robots", "ethics"],
            "personal_notes": "Fascinating ideas about robotics",
            "rating": 4,
            "read_status": "completed"
        }
    },
    {
        "isbn": "9781400033416",
        "payload": {
            "genres": ["literary fiction"],
            "tags": ["identity", "immigration"],
            "personal_notes": "Subtle and reflective",
            "rating": 4,
            "read_status": "completed"
        }
    },
    {
        "isbn": "9780812550702",
        "payload": {
            "genres": ["science fiction"],
            "tags": ["military", "aliens"],
            "personal_notes": "Thoughtful take on war and strategy",
            "rating": 4,
            "read_status": "completed"
        }
    },
    {
        "isbn": "9780141182803",
        "payload": {
            "genres": ["classic", "philosophical"],
            "tags": ["absurdism", "freedom"],
            "personal_notes": "Short but powerful existential work",
            "rating": 4,
            "read_status": "completed"
        }
    },
    {
        "isbn": "9780061120084",
        "payload": {
            "genres": ["classic", "literary fiction"],
            "tags": ["justice", "racism"],
            "personal_notes": "Timeless moral story",
            "rating": 5,
            "read_status": "completed"
        }
    }
]

for book in books:
    url = f"{BASE_URL}/{book['isbn']}"
    # url = f"{BASE_URL}{book['isbn']}"

    try:
        response = requests.post(
            url,
            json=book["payload"],
            headers=HEADERS,
            timeout=10
        )

        print(f"\nPOST {url}")
        print(f"Status: {response.status_code}")

        if response.headers.get("content-type", "").startswith("application/json"):
            print("Response:", response.json())
        else:
            print("Response:", response.text)

    except requests.RequestException as e:
        print(f"\nPOST {url}")
        print("Request failed:", e)
