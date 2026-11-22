"""Standard-library multipart/form-data parser.

Python 3.13 removed the ``cgi`` module. This parser uses ``email.parser`` and
exposes the tiny subset of the old FieldStorage API used by this project.
"""
from __future__ import annotations

import io
from email.parser import BytesParser
from email.policy import default as email_policy

from .security import UploadedFile


def parse_multipart(content_type: str, body: bytes) -> tuple[dict, UploadedFile | None]:
    if not content_type.startswith("multipart/form-data"):
        raise ValueError("不是 multipart/form-data 请求")
    raw = (
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body
    )
    message = BytesParser(policy=email_policy).parsebytes(raw)
    fields: dict = {}
    uploaded: UploadedFile | None = None
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        if filename:
            uploaded = UploadedFile(
                filename=filename,
                type=part.get_content_type(),
                file=io.BytesIO(payload),
            )
        else:
            fields[name] = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
    return fields, uploaded
