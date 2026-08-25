from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import UploadFile

STAGING_DIR = Path(__file__).resolve().parent.parent / "data" / "source_scan_staging"


def staged_path(staging_id: str) -> Path:
    safe = staging_id.strip().replace("/", "").replace("\\", "")
    if not safe or safe != staging_id.strip():
        raise ValueError("invalid staging_id")
    return STAGING_DIR / f"{safe}.zip"


async def save_upload(file: UploadFile, *, max_bytes: int) -> tuple[str, int]:
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    staging_id = uuid.uuid4().hex
    path = staged_path(staging_id)
    size = 0
    try:
        with path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise ValueError(
                        f"ZIP 크기 초과 ({size // (1024 * 1024)}MB > {max_bytes // (1024 * 1024)}MB)"
                    )
                out.write(chunk)
        if size == 0:
            raise ValueError("empty ZIP file")
        return staging_id, size
    except Exception:
        path.unlink(missing_ok=True)
        raise


def read_staged_bytes(staging_id: str) -> bytes:
    path = staged_path(staging_id)
    if not path.is_file():
        raise FileNotFoundError("staging_id not found or expired")
    return path.read_bytes()


def cleanup_staging(staging_id: str) -> None:
    try:
        staged_path(staging_id).unlink(missing_ok=True)
    except ValueError:
        pass
