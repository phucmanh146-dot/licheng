"""Security helpers shared by the HTTP layer.

Kept separate from server.py so password, CSRF and upload validation rules can be
unit-tested without starting a server.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import io
import mimetypes
import secrets
from dataclasses import dataclass


# ---------- password ----------

def legacy_digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_password(value: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(value.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$%s$%s" % (
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(derived).decode("ascii"),
    )


def verify_password(value: str, stored: str) -> bool:
    if stored.startswith("scrypt$"):
        try:
            _, salt_b64, digest_b64 = stored.split("$", 2)
            salt = base64.b64decode(salt_b64)
            expected = base64.b64decode(digest_b64)
            derived = hashlib.scrypt(
                value.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=len(expected)
            )
            return hmac.compare_digest(derived, expected)
        except (ValueError, TypeError):
            return False
    return hmac.compare_digest(legacy_digest(value), stored)


def needs_upgrade(stored: str) -> bool:
    return not stored.startswith("scrypt$")


# ---------- CSRF (double submit cookie) ----------

CSRF_COOKIE = "sy_csrf"
CSRF_HEADER = "X-CSRF-Token"


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def csrf_cookies(token: str, secure: bool = False) -> str:
    suffix = "; Secure" if secure else ""
    return f"{CSRF_COOKIE}={token}; Path=/; SameSite=Lax{suffix}"


def valid_csrf(cookie_header: str, header_token: str | None) -> bool:
    cookie_token = None
    for item in (cookie_header or "").split(";"):
        item = item.strip()
        if item.startswith(f"{CSRF_COOKIE}="):
            cookie_token = item.split("=", 1)[1]
            break
    if not cookie_token or not header_token:
        return False
    return hmac.compare_digest(cookie_token, header_token)


def cookie_value(cookie_header: str, name: str) -> str | None:
    for item in (cookie_header or "").split(";"):
        item = item.strip()
        if item.startswith(f"{name}="):
            return item.split("=", 1)[1]
    return None


# ---------- upload validation ----------

@dataclass
class UploadedFile:
    filename: str
    type: str
    file: io.BytesIO


_SIGNATURES = (
    (b"%PDF-", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
)


def detect_mime(data: bytes, filename: str, declared: str = "") -> str:
    """Detect real MIME from magic bytes; never trust the client Content-Type."""
    for signature, mime in _SIGNATURES:
        if data.startswith(signature):
            return mime
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"\xd0\xcf\x11\xe0"):
        return "application/msword"
    if data.startswith(b"PK\x03\x04"):
        lowered = filename.lower()
        if lowered.endswith(".docx"):
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        return "application/octet-stream"
    guess = mimetypes.guess_type(filename)[0] or declared or "application/octet-stream"
    if guess == "application/pdf" and not data.startswith(b"%PDF-"):
        return "application/octet-stream"
    if guess.startswith("text/"):
        try:
            data.decode("utf-8")
            return guess
        except UnicodeDecodeError:
            return "application/octet-stream"
    return guess
