from __future__ import annotations

import json
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from source_scan.findings import normalize_finding, not_scanned_finding


@dataclass
class ScanResult:
    findings: list[dict[str, Any]] = field(default_factory=list)
    scanned_files: set[str] = field(default_factory=set)
    scanner: str = "bandit"
    available: bool = True
    error: str = ""


def _bandit_cmd() -> list[str]:
    return [sys.executable, "-m", "bandit"]


def bandit_available() -> bool:
    try:
        r = subprocess.run(
            _bandit_cmd() + ["--version"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return r.returncode == 0
    except Exception:
        return False


def scan_python_files(paths: list[Path], *, repo_root: Path) -> ScanResult:
    if not paths:
        return ScanResult(available=True)

    if not bandit_available():
        return ScanResult(
            available=False,
            error="bandit 미설치 — pip install bandit",
            findings=[not_scanned_finding(scanner="bandit", reason="bandit 미설치")],
        )

    findings: list[dict[str, Any]] = []
    scanned: set[str] = set()
    dirs = sorted({str(p.parent) for p in paths})
    rel_files = {str(p.relative_to(repo_root)).replace("\\", "/") for p in paths}

    for d in dirs:
        cmd = _bandit_cmd() + ["-r", d, "-f", "json", "-q", "-ll"]
        try:
            r = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
                cwd=str(repo_root),
            )
        except subprocess.TimeoutExpired:
            findings.append(not_scanned_finding(scanner="bandit", reason=f"timeout: {d}"))
            continue
        except Exception as e:
            findings.append(not_scanned_finding(scanner="bandit", reason=str(e), location=d))
            continue

        stdout = (r.stdout or "").strip()
        if not stdout:
            for p in paths:
                if str(p.parent) == d or str(p.parent).startswith(d):
                    scanned.add(str(p.relative_to(repo_root)).replace("\\", "/"))
            continue

        try:
            data = json.loads(stdout)
        except json.JSONDecodeError:
            if r.stderr:
                findings.append(not_scanned_finding(scanner="bandit", reason=r.stderr[:300], location=d))
            continue

        for item in data.get("results") or []:
            fname = item.get("filename", "")
            rel = Path(fname)
            try:
                rel = Path(fname).resolve().relative_to(repo_root.resolve())
                rel_s = str(rel).replace("\\", "/")
            except Exception:
                rel_s = fname.replace("\\", "/")
            if rel_s not in rel_files and rel_files:
                continue
            scanned.add(rel_s)
            line = item.get("line_number", 0)
            test_id = item.get("test_id", "")
            sev = item.get("issue_severity", "MEDIUM").lower()
            findings.append(
                normalize_finding(
                    location=f"{rel_s}:{line}",
                    message=item.get("issue_text", test_id),
                    scanner="bandit",
                    scanner_rule_id=test_id,
                    severity=sev,
                    rule_set="analog",
                    fix=item.get("issue_cwe", {}).get("link", "") if isinstance(item.get("issue_cwe"), dict) else "",
                    status="fail",
                    language="python",
                )
            )

    for p in paths:
        rel_s = str(p.relative_to(repo_root)).replace("\\", "/")
        if rel_s not in scanned and not any(f.get("location", "").startswith(rel_s) for f in findings if f.get("status") == "fail"):
            scanned.add(rel_s)

    return ScanResult(findings=findings, scanned_files=scanned, available=True)
