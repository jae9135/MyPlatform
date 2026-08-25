from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from source_scan.catalog import load_findsecbugs_rules, load_pmd_rules
from source_scan.exclude import filter_file_list
from source_scan.findings_utils import compute_analog_coverage, compute_diff, dedupe_findings
from source_scan.fix_guides import enrich_finding, get_all_fix_guides
from source_scan.history import find_previous_for_target, list_history, load_history, save_scan_result
from source_scan.java_scanner import scan_java_tree
from source_scan.manifest import PORTAL_TARGET_IDS, TARGETS, get_target, repo_root, resolve_globs
from source_scan.progress import ProgressReporter, ScanCancelled, is_cancelled, submit_scan_job
from source_scan.python_scanner import scan_python_files
from source_scan.scan_options import ScanOptions
from source_scan.typescript_scanner import scan_typescript_files
from source_scan.zip_ingest import cleanup_ingest, ingest_zip, validate_zip_bytes


def validate_source_scan(
    mode: str,
    target: str,
    *,
    zip_bytes: bytes | None = None,
    options: ScanOptions | None = None,
) -> dict[str, Any]:
    opts = options or ScanOptions()
    mode = (mode or "portal").strip().lower()
    if mode not in ("portal", "upload"):
        return {"ok": False, "can_run": False, "message": "mode는 portal|upload"}

    if mode == "upload":
        if not zip_bytes:
            return {"ok": True, "can_run": False, "message": "ZIP 파일을 선택하세요", "mode": mode}
        result = validate_zip_bytes(zip_bytes, max_bytes=opts.zip_max_bytes, warn_bytes=opts.zip_warn_bytes)
        result["mode"] = mode
        return result

    if target not in PORTAL_TARGET_IDS:
        return {"ok": False, "can_run": False, "message": f"지원하지 않는 대상: {target}"}

    cfg = get_target(target) or {}
    root = repo_root()
    py = resolve_globs(cfg.get("python_globs") or [], root=root)
    ts = resolve_globs(cfg.get("typescript_globs") or [], root=root)
    if not py and not ts:
        return {
            "ok": True,
            "can_run": True,
            "message": "소스 경로 없음 — Java만 해당될 수 있음",
            "target": target,
            "file_count": 0,
        }
    return {
        "ok": True,
        "can_run": True,
        "message": f"진단 가능 — Python {len(py)} · TS/JS {len(ts)} 파일",
        "target": target,
        "file_count": len(py) + len(ts),
    }


def get_environment_status() -> dict[str, Any]:
    import os
    import subprocess

    from source_scan.java_scanner import (
        _resolve_cli,
        detect_jdk_hint,
        findsecbugs_plugin,
        pmd_executable,
        spotbugs_executable,
    )

    mvn = _resolve_cli("mvn")
    mvn_ok = False
    mvn_detail = ""
    if mvn:
        try:
            proc = subprocess.run([mvn, "-version"], capture_output=True, timeout=20)
            mvn_ok = proc.returncode == 0
            if not mvn_ok:
                mvn_detail = (proc.stderr or proc.stdout or b"").decode("utf-8", errors="replace")[:200]
        except Exception as e:
            mvn_detail = str(e)
    return {
        "revision": "mvn-cmd-fix-2",
        "mvn_path": mvn,
        "mvn_ok": mvn_ok,
        "mvn_detail": mvn_detail,
        "java_home": os.environ.get("JAVA_HOME", ""),
        "jdk_hint": detect_jdk_hint(repo_root()),
        "pmd": bool(pmd_executable()),
        "spotbugs": bool(spotbugs_executable()),
        "findsecbugs_plugin": str(findsecbugs_plugin() or ""),
    }


def run_source_scan(
    mode: str,
    target: str,
    *,
    zip_bytes: bytes | None = None,
    try_java_build: bool = True,
    job_id: str | None = None,
    options: ScanOptions | None = None,
) -> dict[str, Any]:
    opts = options or ScanOptions(try_java_build=try_java_build)
    progress = ProgressReporter(job_id) if job_id else None
    mode = (mode or "portal").strip().lower()
    root = repo_root()

    if mode == "upload":
        if not zip_bytes:
            raise ValueError("upload mode requires ZIP file")
        v = validate_zip_bytes(zip_bytes, max_bytes=opts.zip_max_bytes, warn_bytes=opts.zip_warn_bytes)
        if not v.get("can_run"):
            raise ValueError(v.get("message", "ZIP 검증 실패"))
        if progress:
            progress.set_plan(["prepare", "ingest"])
            progress.start("prepare", "진단 준비 중…")
            progress.done("prepare")
            progress.start("ingest", "ZIP 해제 중…")
        ing = ingest_zip(zip_bytes, exclude_globs=opts.effective_exclude())
        try:
            if progress:
                progress.check_cancelled()
            has_java = bool(ing.java_files)
            ingest_detail = (
                f"Python {len(ing.python_files)} · TS/JS {len(ing.typescript_files)} · "
                f"Java {len(ing.java_files)} · {ing.zip_size_bytes // (1024 * 1024)}MB"
            )
            run_eslint = opts.try_eslint_zip and bool(ing.typescript_files)
            try_build = opts.try_java_build and (ing.has_pom or ing.has_gradle or bool(ing.java_files))
            _init_progress_plan(
                progress,
                mode=mode,
                python_files=ing.python_files,
                typescript_files=ing.typescript_files if run_eslint else [],
                has_java=has_java,
                try_java_build=try_build,
                done_ids=["prepare", "ingest"],
                step_details={"ingest": ingest_detail},
            )
            payload = _scan_paths(
                target="upload",
                target_name="ZIP 업로드",
                mode=mode,
                root=ing.root,
                rel_prefix="upload",
                python_files=ing.python_files,
                typescript_files=ing.typescript_files,
                java_files=ing.java_files,
                try_java_build=try_build,
                run_eslint_upload=run_eslint,
                progress=progress,
                job_id=job_id,
                options=opts,
                ingest_warnings=ing.warnings + v.get("warnings", []),
            )
            if job_id:
                save_scan_result(job_id, payload)
            return payload
        finally:
            cleanup_ingest(ing)

    if target not in PORTAL_TARGET_IDS:
        raise ValueError(f"unsupported target: {target}")

    cfg = get_target(target) or {}
    py_paths = filter_file_list(resolve_globs(cfg.get("python_globs") or [], root=root), root, opts.effective_exclude())
    ts_paths = filter_file_list(resolve_globs(cfg.get("typescript_globs") or [], root=root), root, opts.effective_exclude())
    java_paths = resolve_globs(cfg.get("java_globs") or [], root=root)
    has_java = bool(java_paths)

    _init_progress_plan(
        progress,
        mode=mode,
        python_files=py_paths,
        typescript_files=ts_paths,
        has_java=has_java,
        try_java_build=opts.try_java_build,
    )

    payload = _scan_paths(
        target=target,
        target_name=cfg.get("name", target),
        mode=mode,
        root=root,
        rel_prefix="",
        python_files=py_paths,
        typescript_files=ts_paths,
        java_files=java_paths,
        try_java_build=opts.try_java_build,
        run_eslint_upload=False,
        progress=progress,
        job_id=job_id,
        options=opts,
    )
    if job_id:
        save_scan_result(job_id, payload)
    return payload


def _init_progress_plan(
    progress: ProgressReporter | None,
    *,
    mode: str,
    python_files: list[Path],
    typescript_files: list[Path],
    has_java: bool,
    try_java_build: bool,
    done_ids: list[str] | None = None,
    step_details: dict[str, str] | None = None,
) -> None:
    if not progress:
        return
    steps: list[str] = ["prepare"]
    if mode == "upload":
        steps.append("ingest")
    if python_files:
        steps.append("bandit")
    if typescript_files:
        steps.append("eslint")
    if has_java:
        steps.append("pmd")
        if try_java_build:
            steps.append("java_build")
            steps.append("findsecbugs")
    steps.append("finalize")
    progress.set_plan(steps, done_ids=done_ids, step_details=step_details)
    if not done_ids or "prepare" not in done_ids:
        progress.start("prepare", "진단 준비 중…")
        progress.done("prepare")


def _java_progress_bridge(progress: ProgressReporter):
    def handler(phase: str, detail: str) -> None:
        progress.check_cancelled()
        if phase == "pmd":
            progress.start("pmd", detail)
        elif phase == "pmd_done":
            progress.done("pmd", detail)
        elif phase == "java_build":
            progress.start("java_build", detail)
        elif phase == "findsecbugs":
            progress.done("java_build")
            progress.start("findsecbugs", detail)
        elif phase == "findsecbugs_done":
            progress.done("findsecbugs", detail)

    return handler


def _scanner_meta(
    name: str,
    *,
    available: bool,
    ran: bool = False,
    fail_count: int = 0,
    error: str = "",
    skipped: bool = False,
) -> dict[str, Any]:
    if skipped:
        return {"available": False, "ran": False, "fail_count": 0, "error": error, "skipped": True, "summary": f"{name}: 건너뜀"}
    if not available:
        return {"available": False, "ran": False, "fail_count": 0, "error": error or "미설정", "summary": f"{name}: {error or '미설정'}"}
    if ran:
        return {
            "available": True,
            "ran": True,
            "fail_count": fail_count,
            "error": error,
            "summary": f"{name}: 분석 완료 ({fail_count}건)",
        }
    return {"available": True, "ran": False, "fail_count": 0, "error": error, "summary": f"{name}: 도구 OK · 분석 미실행"}


def _scan_paths(
    *,
    target: str,
    target_name: str,
    mode: str,
    root: Path,
    rel_prefix: str,
    python_files: list[Path],
    typescript_files: list[Path],
    java_files: list[Path],
    try_java_build: bool,
    run_eslint_upload: bool,
    progress: ProgressReporter | None = None,
    job_id: str | None = None,
    options: ScanOptions | None = None,
    ingest_warnings: list[str] | None = None,
) -> dict[str, Any]:
    opts = options or ScanOptions()
    findings: list[dict[str, Any]] = []
    coverage: list[dict[str, Any]] = []
    scanners_meta: dict[str, Any] = {}
    languages: list[str] = []

    def _check() -> None:
        if progress:
            progress.check_cancelled()
        elif job_id and is_cancelled(job_id):
            raise ScanCancelled("사용자가 진단을 취소했습니다")

    if python_files:
        _check()
        if progress:
            progress.start("bandit", f"Bandit 분석 중… ({len(python_files)}개 파일)")
        py_root = root if mode == "upload" else repo_root()
        py_res = scan_python_files(python_files, repo_root=py_root)
        findings.extend(py_res.findings)
        fail_n = sum(1 for f in py_res.findings if f.get("status") == "fail")
        scanners_meta["bandit"] = _scanner_meta(
            "bandit",
            available=py_res.available,
            ran=py_res.available and not py_res.error,
            fail_count=fail_n,
            error=py_res.error,
        )
        for rel in sorted(py_res.scanned_files):
            coverage.append({"path": rel, "language": "python", "scanned": True, "scanner": "bandit"})
        if progress:
            progress.done("bandit")

    run_eslint = (mode != "upload") or run_eslint_upload
    if typescript_files and run_eslint:
        _check()
        if progress:
            progress.start("eslint", f"ESLint 분석 중… ({len(typescript_files)}개 파일)")
        ts_root = root if mode == "upload" else repo_root()
        ts_res = scan_typescript_files(typescript_files, repo_root=ts_root)
        findings.extend(ts_res.findings)
        fail_n = sum(1 for f in ts_res.findings if f.get("status") == "fail")
        scanners_meta["eslint"] = _scanner_meta(
            "eslint",
            available=ts_res.available,
            ran=ts_res.available and not ts_res.error,
            fail_count=fail_n,
            error=ts_res.error,
        )
        for rel in sorted(ts_res.scanned_files):
            coverage.append({"path": rel, "language": "typescript", "scanned": True, "scanner": "eslint"})
        if progress:
            progress.done("eslint")
    elif typescript_files and mode == "upload" and not run_eslint_upload:
        msg = "ZIP TS/JS eslint 꺼짐 — 옵션 활성화 또는 포털 앱 모드 사용"
        scanners_meta["eslint"] = _scanner_meta("eslint", available=False, error=msg, skipped=True)
        if progress:
            progress.skip("eslint", msg)

    has_java = bool(java_files) or (mode == "upload" and bool(java_files))
    jdk_hint = ""
    if has_java:
        _check()
        java_dir = root if mode == "upload" else repo_root()
        if java_files and mode != "upload":
            java_dir = java_files[0].parent
        java_cb = _java_progress_bridge(progress) if progress else None
        cancel_fn = (lambda: is_cancelled(job_id)) if job_id else None
        j_res = scan_java_tree(
            java_dir,
            rel_prefix=rel_prefix,
            try_build=try_java_build,
            on_progress=java_cb,
            is_cancelled=cancel_fn,
            exclude_globs=opts.effective_exclude(),
            pmd_rulesets=opts.effective_pmd_rulesets(),
            use_prebuilt_classes=opts.use_prebuilt_classes,
            spotbugs_effort=opts.spotbugs_effort,
            spotbugs_threshold=opts.spotbugs_threshold,
        )
        findings.extend(j_res.findings)
        jdk_hint = j_res.jdk_hint
        scanners_meta["pmd"] = _scanner_meta(
            "pmd",
            available=j_res.pmd_available,
            ran=j_res.pmd_ran,
            fail_count=j_res.pmd_fail_count,
            error=j_res.pmd_error,
        )
        scanners_meta["spotbugs"] = _scanner_meta(
            "spotbugs",
            available=j_res.spotbugs_available,
            ran=j_res.spotbugs_ran,
            fail_count=j_res.spotbugs_fail_count,
            error=j_res.spotbugs_error,
        )
        for rel in sorted(j_res.scanned_files):
            coverage.append({"path": rel, "language": "java", "scanned": True, "scanner": "pmd/spotbugs"})
    elif progress:
        for sid in ("pmd", "java_build", "findsecbugs"):
            progress.skip(sid)

    findings = dedupe_findings(findings)
    findings = [enrich_finding(f) for f in findings]
    if python_files:
        languages.append("python")
    if typescript_files:
        languages.append("typescript")
    if has_java:
        languages.append("java")

    stats = _compute_stats(findings)
    analog_coverage = compute_analog_coverage(findings)

    diff: dict[str, Any] | None = None
    if job_id:
        prev = find_previous_for_target(target, mode, exclude_job_id=job_id)
        if prev and prev.get("payload"):
            diff = compute_diff(findings, (prev["payload"].get("findings") or []))

    if progress:
        progress.start("finalize", "결과 정리 중…")
        progress.done("finalize")

    return {
        "ok": True,
        "mode": mode,
        "target": target,
        "target_name": target_name,
        "job_id": job_id,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "findings": findings,
        "stats": stats,
        "coverage": {"sources": coverage},
        "scanners": scanners_meta,
        "languages": languages,
        "warnings": ingest_warnings or [],
        "jdk_hint": jdk_hint,
        "analog_coverage": analog_coverage,
        "diff": diff,
        "scan_options": {
            "try_java_build": try_java_build,
            "try_eslint_zip": run_eslint_upload,
            "pmd_rulesets": opts.effective_pmd_rulesets(),
            "exclude_globs": opts.effective_exclude(),
            "spotbugs_effort": opts.spotbugs_effort,
            "spotbugs_threshold": opts.spotbugs_threshold,
            "use_prebuilt_classes": opts.use_prebuilt_classes,
        },
        "rules": {
            "pmd": load_pmd_rules(),
            "findsecbugs": load_findsecbugs_rules(),
        },
        "targets": [t for t in TARGETS if t.get("mode") == "portal"],
    }


def _compute_stats(findings: list[dict[str, Any]]) -> dict[str, Any]:
    stats: dict[str, Any] = {
        "total": len(findings),
        "fail": 0,
        "not_scanned": 0,
        "pass": 0,
        "by_ruleset": {"pmd": 0, "findsecbugs": 0, "analog": 0, "system": 0},
        "by_scanner": {},
        "by_severity": {"high": 0, "medium": 0, "low": 0},
        "by_language": {},
    }
    for f in findings:
        st = f.get("status", "fail")
        if st == "fail":
            stats["fail"] += 1
        elif st == "not_scanned":
            stats["not_scanned"] += 1
        elif st == "pass":
            stats["pass"] += 1
        rs = f.get("rule_set", "")
        if rs in stats["by_ruleset"]:
            stats["by_ruleset"][rs] += 1
        sc = f.get("scanner", "")
        stats["by_scanner"][sc] = stats["by_scanner"].get(sc, 0) + 1
        sev = f.get("severity", "")
        if sev in stats["by_severity"]:
            stats["by_severity"][sev] += 1
        lang = f.get("language", "") or "unknown"
        stats["by_language"][lang] = stats["by_language"].get(lang, 0) + 1
    return stats


def get_scan_history(limit: int = 30) -> list[dict[str, Any]]:
    return list_history(limit=limit)


def get_scan_diff(job_id: str, compare_job_id: str | None = None) -> dict[str, Any]:
    current = load_history(job_id)
    if not current:
        from source_scan.progress import get_job

        job = get_job(job_id)
        if not job or not job.result:
            raise ValueError("job not found")
        current_findings = job.result.get("findings") or []
        target = job.result.get("target", "")
        mode = job.result.get("mode", "")
    else:
        current_findings = (current.get("payload") or {}).get("findings") or []
        target = (current.get("payload") or {}).get("target", "")
        mode = (current.get("payload") or {}).get("mode", "")

    prev_rec = None
    if compare_job_id:
        prev_rec = load_history(compare_job_id)
    else:
        prev_rec = find_previous_for_target(target, mode, exclude_job_id=job_id)

    if not prev_rec:
        return {"ok": True, "message": "비교할 이전 진단 없음", "diff": None}
    prev_findings = (prev_rec.get("payload") or {}).get("findings") or []
    return {
        "ok": True,
        "compare_job_id": prev_rec.get("job_id"),
        "diff": compute_diff(current_findings, prev_findings),
    }


def run_source_scan_job(
    job_id: str,
    mode: str,
    target: str,
    *,
    zip_bytes: bytes | None = None,
    staging_id: str | None = None,
    try_java_build: bool = True,
    options: ScanOptions | None = None,
) -> None:
    from source_scan.staging import cleanup_staging, read_staged_bytes

    progress = ProgressReporter(job_id)
    loaded_staging = staging_id
    try:
        if is_cancelled(job_id):
            progress.cancelled()
            return
        if loaded_staging:
            zip_bytes = read_staged_bytes(loaded_staging)
        result = run_source_scan(
            mode,
            target,
            zip_bytes=zip_bytes,
            try_java_build=try_java_build,
            job_id=job_id,
            options=options,
        )
        progress.complete(result)
    except ScanCancelled:
        progress.cancelled()
    except Exception as e:
        progress.fail(str(e))
    finally:
        if loaded_staging:
            cleanup_staging(loaded_staging)


def schedule_source_scan_job(
    job_id: str,
    mode: str,
    target: str,
    *,
    zip_bytes: bytes | None = None,
    staging_id: str | None = None,
    try_java_build: bool = True,
    options: ScanOptions | None = None,
) -> None:
    submit_scan_job(
        run_source_scan_job,
        job_id,
        mode,
        target,
        zip_bytes=zip_bytes,
        staging_id=staging_id,
        try_java_build=try_java_build,
        options=options,
    )


def get_fix_guides_catalog() -> dict[str, Any]:
    return get_all_fix_guides()


def get_scan_history_record(job_id: str) -> dict[str, Any] | None:
    return load_history(job_id)


def export_scan_payload(payload: dict[str, Any], fmt: str) -> tuple[bytes, str, str]:
    """Returns (data, filename, media_type)."""
    from source_scan.report import (
        build_cover_html,
        build_html_report,
        build_sarif_bytes,
        build_xlsx_bytes,
        build_zip_bytes,
    )

    fmt = (fmt or "xlsx").lower().strip()
    slug = payload.get("target") or "scan"
    date_part = str(payload.get("scanned_at") or "")[:10] or "report"

    if fmt == "xlsx":
        return (
            build_xlsx_bytes(payload),
            f"source_scan_{slug}_{date_part}.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    if fmt == "zip":
        return (
            build_zip_bytes(payload),
            f"source_scan_{slug}_{date_part}.zip",
            "application/zip",
        )
    if fmt == "html":
        html = build_html_report(payload)
        return (
            html.encode("utf-8"),
            f"source_scan_{slug}_{date_part}.html",
            "text/html; charset=utf-8",
        )
    if fmt == "cover":
        html = build_cover_html(payload)
        return (
            html.encode("utf-8"),
            f"source_scan_cover_{slug}_{date_part}.html",
            "text/html; charset=utf-8",
        )
    if fmt == "sarif":
        return (
            build_sarif_bytes(payload),
            f"source_scan_{slug}_{date_part}.sarif.json",
            "application/sarif+json",
        )
    raise ValueError("format must be xlsx|html|zip|cover|sarif")
