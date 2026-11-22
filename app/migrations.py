"""Minimal versioned SQLite migrations.

Add new (version, sql) pairs here instead of editing the schema in place.
"""
from __future__ import annotations

import sqlite3

LATEST_VERSION = 1

MIGRATIONS: list[tuple[int, str]] = [
    (1, "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT)"),
]


def migrate(conn: sqlite3.Connection, now_fn) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT)"
    )
    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
    for version, sql in MIGRATIONS:
        if version not in applied:
            conn.execute(sql)
            conn.execute(
                "INSERT OR REPLACE INTO schema_migrations VALUES (?, ?)", (version, now_fn())
            )
