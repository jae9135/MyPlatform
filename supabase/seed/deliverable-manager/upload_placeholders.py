"""
Upload generated public shells to Supabase Storage bucket `samples`.

Requires:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Usage (from this directory, after build_placeholders.py):
  python upload_placeholders.py
"""

from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
BUCKET = "samples"
PREFIX = "deliverable-manager"


def env(name: str) -> str:
    value = (os.environ.get(name) or "").strip().strip('"').strip("'")
    if not value:
        raise SystemExit(f"Missing env {name}")
    return value.rstrip("/")


def object_url(base: str, object_path: str) -> str:
    encoded = "/".join(quote(part, safe="") for part in object_path.split("/") if part)
    return f"{base}/storage/v1/object/{BUCKET}/{encoded}"


def upload_one(base: str, key: str, rel: Path, body: bytes) -> None:
    object_path = f"{PREFIX}/{rel.as_posix()}"
    url = object_url(base, object_path)
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": "text/plain; charset=utf-8",
        "x-upsert": "true",
    }

    def request(method: str) -> None:
        req = urllib.request.Request(url, data=body, method=method, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as res:
            res.read()

    try:
        request("POST")
    except urllib.error.HTTPError as exc:
        if exc.code in (409, 400):
            try:
                request("PUT")
                return
            except urllib.error.HTTPError as put_exc:
                detail = put_exc.read().decode("utf-8", errors="replace")
                raise SystemExit(
                    f"Upload failed {object_path}: {put_exc.code} {detail}"
                ) from put_exc
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Upload failed {object_path}: {exc.code} {detail}") from exc
    except UnicodeEncodeError as exc:
        raise SystemExit(f"URL encode failed {object_path}: {exc}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Network error {object_path}: {exc}") from exc


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if not OUT.is_dir():
        raise SystemExit("Run build_placeholders.py first (out/ missing).")

    base = env("SUPABASE_URL")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    files = [p for p in OUT.rglob("*") if p.is_file()]
    print(f"Uploading {len(files)} objects to {BUCKET}/{PREFIX}/")
    for i, path in enumerate(files, start=1):
        rel = path.relative_to(OUT)
        upload_one(base, key, rel, path.read_bytes())
        if i % 50 == 0 or i == len(files):
            print(f"  {i}/{len(files)}")
    print("Done. Bucket `samples` must be Public for the portal to read files.")
    print(f"Catalog URL: {base}/storage/v1/object/public/{BUCKET}/{PREFIX}/catalog.json")


if __name__ == "__main__":
    main()
