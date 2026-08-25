from __future__ import annotations

import shutil
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from source_scan.exclude import filter_file_list, is_excluded_path


@dataclass
class ZipIngestResult:
    root: Path
    temp_dir: str = ""
    python_files: list[Path] = field(default_factory=list)
    typescript_files: list[Path] = field(default_factory=list)
    java_files: list[Path] = field(default_factory=list)
    has_pom: bool = False
    has_gradle: bool = False
    has_prebuilt_classes: bool = False
    primary_language: str = ""
    zip_size_bytes: int = 0
    file_count: int = 0
    warnings: list[str] = field(default_factory=list)


def validate_zip_bytes(
    zip_bytes: bytes,
    *,
    max_bytes: int = 200 * 1024 * 1024,
    warn_bytes: int = 50 * 1024 * 1024,
) -> dict[str, Any]:
    size = len(zip_bytes)
    warnings: list[str] = []
    if size > max_bytes:
        return {
            "ok": False,
            "can_run": False,
            "message": f"ZIP 크기 초과 ({size // (1024 * 1024)}MB > {max_bytes // (1024 * 1024)}MB)",
            "zip_size_bytes": size,
        }
    if size > warn_bytes:
        warnings.append(f"대용량 ZIP ({size // (1024 * 1024)}MB) — 진단에 수 분 소요될 수 있습니다")
    try:
        with zipfile.ZipFile(__import__("io").BytesIO(zip_bytes), "r") as zf:
            names = zf.namelist()
            if not names:
                return {"ok": False, "can_run": False, "message": "빈 ZIP", "zip_size_bytes": size}
            if len(names) > 50_000:
                warnings.append(f"파일 수 많음 ({len(names)}개)")
    except zipfile.BadZipFile:
        return {"ok": False, "can_run": False, "message": "유효하지 않은 ZIP", "zip_size_bytes": size}
    return {
        "ok": True,
        "can_run": True,
        "message": "ZIP 업로드 진단 가능",
        "zip_size_bytes": size,
        "warnings": warnings,
    }


def ingest_zip(zip_bytes: bytes, exclude_globs: list[str] | None = None) -> ZipIngestResult:
    tmp = tempfile.mkdtemp(prefix="source_scan_")
    root = Path(tmp)
    zpath = root / "upload.zip"
    zpath.write_bytes(zip_bytes)
    with zipfile.ZipFile(zpath, "r") as zf:
        zf.extractall(root / "src")
    src = root / "src"
    py: list[Path] = []
    ts: list[Path] = []
    java: list[Path] = []
    has_pom = False
    has_gradle = False
    has_prebuilt = False
    file_count = 0
    for p in src.rglob("*"):
        if not p.is_file():
            continue
        file_count += 1
        if is_excluded_path(p, src, exclude_globs):
            continue
        if p.name == "pom.xml":
            has_pom = True
        if p.name in ("build.gradle", "build.gradle.kts"):
            has_gradle = True
        if p.suffix.lower() == ".class":
            has_prebuilt = True
        suf = p.suffix.lower()
        if suf == ".py":
            py.append(p)
        elif suf in (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"):
            ts.append(p)
        elif suf == ".java":
            java.append(p)
    py = filter_file_list(py, src, exclude_globs)
    ts = filter_file_list(ts, src, exclude_globs)
    java = filter_file_list(java, src, exclude_globs)
    primary = ""
    counts = {"python": len(py), "typescript": len(ts), "java": len(java)}
    if counts:
        primary = max(counts, key=lambda k: counts[k])
        if counts[primary] == 0:
            primary = "unknown"
    warnings: list[str] = []
    if len(zip_bytes) > 50 * 1024 * 1024:
        warnings.append("대용량 ZIP — Java Maven/SpotBugs는 시간이 걸릴 수 있습니다")
    return ZipIngestResult(
        root=src,
        temp_dir=tmp,
        python_files=py,
        typescript_files=ts,
        java_files=java,
        has_pom=has_pom,
        has_gradle=has_gradle,
        has_prebuilt_classes=has_prebuilt,
        primary_language=primary,
        zip_size_bytes=len(zip_bytes),
        file_count=file_count,
        warnings=warnings,
    )


def cleanup_ingest(result: ZipIngestResult) -> None:
    if result.temp_dir:
        shutil.rmtree(result.temp_dir, ignore_errors=True)
