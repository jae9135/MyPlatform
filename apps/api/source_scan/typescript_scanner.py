from __future__ import annotations

import json
import os
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
    scanner: str = "eslint"
    available: bool = True
    error: str = ""


ESLINT_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


def _portal_dir(repo_root: Path) -> Path:
    return repo_root / "apps" / "portal"


def eslint_config_path(portal_dir: Path) -> Path:
    for name in ("eslint.config.mjs", "eslint.config.js", ".eslintrc.json"):
        p = portal_dir / name
        if p.is_file():
            return p
    return portal_dir / "eslint.config.mjs"


def eslint_available(portal_dir: Path) -> tuple[bool, str]:
    if not (portal_dir / "node_modules").is_dir():
        return False, "portal node_modules 없음 — npm install in apps/portal"
    eslint_bin = portal_dir / "node_modules" / ".bin" / ("eslint.cmd" if sys.platform == "win32" else "eslint")
    if not eslint_bin.is_file():
        return False, "eslint 미설치 — apps/portal npm install"
    return True, ""


# 소스 점검 전용 ESLint 도구 폴더 (apps/api/source_scan/eslint_tool — Docker 에서 npm ci)
_BUNDLED_TOOL_DIR = Path(__file__).resolve().parent / "eslint_tool"


def resolve_eslint_tool_dir(repo_root: Path) -> tuple[Path | None, str]:  # noqa: ARG001 — 업로드 폴더는 일부러 쓰지 않음
    """ESLint 실행 파일·설정이 있는 폴더.

    우선순위: ESLINT_TOOL_DIR 환경변수 → 동봉 도구(eslint_tool, node_modules 설치됨) → 플랫폼 포털(apps/portal).
    업로드 ZIP 점검에서는 repo_root 가 업로드 폴더라, 도구는 반드시 서버 쪽 폴더에서 찾아야 함.
    """
    candidates: list[Path] = []
    env_dir = (os.getenv("ESLINT_TOOL_DIR") or "").strip()
    if env_dir:
        candidates.append(Path(env_dir))
    candidates.append(_BUNDLED_TOOL_DIR)
    # 주의: 업로드 폴더(repo_root) 안의 node_modules 는 절대 실행하지 않음 — 업로드한 ZIP 이 실행 파일을 넣을 수 있음
    from source_scan.manifest import repo_root as platform_root  # 순환 import 방지

    candidates.append(_portal_dir(platform_root()))
    reason = ""
    for c in candidates:
        ok, why = eslint_available(c)
        if ok:
            return c, ""
        reason = reason or why
    return None, "eslint 도구 없음 — apps/api/source_scan/eslint_tool 에서 npm ci (또는 ESLINT_TOOL_DIR 설정)"


def scan_typescript_files(
    paths: list[Path],
    *,
    repo_root: Path,
) -> ScanResult:
    if not paths:
        return ScanResult(available=True)

    portal, reason = resolve_eslint_tool_dir(repo_root)
    if portal is None:
        return ScanResult(
            available=False,
            error=reason,
            findings=[not_scanned_finding(scanner="eslint", reason=reason)],
        )

    ts_paths = [p for p in paths if p.suffix.lower() in ESLINT_EXTENSIONS]
    if not ts_paths:
        return ScanResult(available=True)

    eslint_bin = portal / "node_modules" / ".bin" / ("eslint.cmd" if sys.platform == "win32" else "eslint")
    config = eslint_config_path(portal)
    rel_files = {str(p.relative_to(repo_root)).replace("\\", "/") for p in ts_paths}

    cmd = [
        str(eslint_bin),
        "-c",
        str(config),
        "-f",
        "json",
        "--no-error-on-unmatched-pattern",
    ] + [str(p) for p in ts_paths]

    env = os.environ.copy()
    env["NODE_PATH"] = str(portal / "node_modules")

    try:
        r = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            # ESLint 9 는 실행 폴더 밖의 파일을 무시하므로, 점검 대상 폴더에서 실행 (설정·플러그인은 -c 경로 기준으로 로드)
            cwd=str(repo_root),
            env=env,
        )
    except subprocess.TimeoutExpired:
        return ScanResult(
            available=False,
            error="eslint timeout",
            findings=[not_scanned_finding(scanner="eslint", reason="timeout")],
        )
    except Exception as e:
        return ScanResult(
            available=False,
            error=str(e),
            findings=[not_scanned_finding(scanner="eslint", reason=str(e))],
        )

    stdout = (r.stdout or "").strip()
    findings: list[dict[str, Any]] = []
    scanned: set[str] = set()

    if stdout:
        try:
            reports = json.loads(stdout)
        except json.JSONDecodeError:
            reports = []
            if r.stderr:
                findings.append(not_scanned_finding(scanner="eslint", reason=r.stderr[:400]))
        for file_report in reports:
            fpath = file_report.get("filePath", "")
            try:
                rel_s = str(Path(fpath).resolve().relative_to(repo_root.resolve())).replace("\\", "/")
            except Exception:
                rel_s = fpath.replace("\\", "/")
            if rel_s not in rel_files:
                continue
            msgs = file_report.get("messages") or []
            if msgs:
                scanned.add(rel_s)
            for msg in msgs:
                rule_id = msg.get("ruleId") or "unknown"
                if "Definition for rule" in (msg.get("message") or ""):
                    continue
                sev = (msg.get("severity") or 1)
                severity = "high" if sev >= 2 else "medium" if sev == 1 else "low"
                line = msg.get("line", 0)
                findings.append(
                    normalize_finding(
                        location=f"{rel_s}:{line}",
                        message=msg.get("message", rule_id),
                        scanner="eslint",
                        scanner_rule_id=rule_id,
                        severity=severity,
                        rule_set="analog",
                        status="fail",
                        language="typescript",
                    )
                )

    for p in ts_paths:
        rel_s = str(p.relative_to(repo_root)).replace("\\", "/")
        if rel_s not in scanned:
            scanned.add(rel_s)

    return ScanResult(findings=findings, scanned_files=scanned, available=True)
