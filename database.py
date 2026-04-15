import sqlite3
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

DB_PATH = "watcher.db"


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                competitor TEXT,
                page_type TEXT,
                url TEXT,
                content TEXT,
                content_hash TEXT,
                scraped_at TIMESTAMP
            )
        """)
        conn.commit()


def save_snapshot(competitor, page_type, url, content, content_hash):
    scraped_at = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO snapshots (competitor, page_type, url, content, content_hash, scraped_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (competitor, page_type, url, content, content_hash, scraped_at),
        )
        conn.commit()


def get_latest_snapshot(competitor, page_type):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            """
            SELECT * FROM snapshots
            WHERE competitor = ? AND page_type = ?
            ORDER BY scraped_at DESC
            LIMIT 1
            """,
            (competitor, page_type),
        )
        return cursor.fetchone()
