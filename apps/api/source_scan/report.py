from __future__ import annotations

import html as html_lib
import io
import json
import zipfile
from typing import Any

import pandas as pd


FINDING_COLUMNS = [
    "위치", "룰셋", "기준ID", "참조룰셋", "분류", "상태", "심각도",
    "스캐너", "스캐너규칙", "언어", "내용", "개선안", "참조URL",
]

SEVERITY_LABEL = {"high": "높음", "medium": "중간", "low": "낮음", "fail": "미흡", "not_scanned": "미실행", "pass": "통과"}


def _findings_rows(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for f in findings:
        rows.append(
            {
                "위치": f.get("location", ""),
                "룰셋": f.get("rule_set", ""),
                "기준ID": f.get("rule_id", ""),
                "참조룰셋": f.get("reference_ruleset", ""),
                "분류": f.get("category", ""),
                "상태": SEVERITY_LABEL.get(f.get("status", ""), f.get("status", "")),
                "심각도": SEVERITY_LABEL.get(f.get("severity", ""), f.get("severity", "")),
                "스캐너": f.get("scanner", ""),
                "스캐너규칙": f.get("scanner_rule_id", ""),
                "언어": f.get("language", ""),
                "내용": f.get("message", ""),
                "개선안": f.get("fix", ""),
                "참조URL": f.get("reference_url", ""),
            }
        )
    return rows


def build_cover_html(payload: dict[str, Any]) -> str:
    stats = payload.get("stats") or {}
    scanners = payload.get("scanners") or {}
    diff = payload.get("diff") or {}
    scanner_lines = "".join(
        f"<li>{html_lib.escape(str(meta.get('summary', k)))}</li>" for k, meta in scanners.items()
    )
    diff_block = ""
    if diff:
        diff_block = f"""
<div class="cover-section">
  <h2>이전 진단 대비</h2>
  <p>신규 {diff.get('new_count', 0)}건 · 해소 {diff.get('resolved_count', 0)}건 · 유지 {diff.get('unchanged_count', 0)}건</p>
</div>"""
    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/>
<title>소스코드·보안 진단 표지</title>
<style>
body{{font-family:system-ui,sans-serif;margin:40px;color:#222;}}
.cover-title{{font-size:28px;margin-bottom:8px;}}
.cover-meta{{color:#555;margin-bottom:24px;}}
.cover-section{{margin:24px 0;padding:16px;background:#f8f9fa;border-radius:8px;}}
.stats{{display:flex;gap:16px;flex-wrap:wrap;}}
.stat{{padding:12px 18px;background:#fff;border:1px solid #ddd;border-radius:8px;}}
</style></head><body>
<h1 class="cover-title">소스코드·보안 진단 보고서</h1>
<p class="cover-meta">
  <strong>{html_lib.escape(str(payload.get('target_name','')))}</strong><br/>
  진단 일시: {html_lib.escape(str(payload.get('scanned_at','')))}<br/>
  모드: {html_lib.escape(str(payload.get('mode','')))} · 언어: {html_lib.escape(', '.join(payload.get('languages') or []))}
</p>
<div class="cover-section">
  <h2>점검 기준</h2>
  <p>PMD · FindSecBugs(SpotBugs) · Bandit/ESLint Analog 매핑</p>
  <p>{html_lib.escape(str(payload.get('jdk_hint','')))}</p>
</div>
<div class="cover-section stats">
  <div class="stat">전체 <strong>{stats.get('total',0)}</strong></div>
  <div class="stat">미흡 <strong>{stats.get('fail',0)}</strong></div>
  <div class="stat">미실행 <strong>{stats.get('not_scanned',0)}</strong></div>
</div>
<div class="cover-section">
  <h2>스캐너</h2>
  <ul>{scanner_lines}</ul>
</div>
{diff_block}
</body></html>"""


def build_xlsx_bytes(payload: dict[str, Any]) -> bytes:
    findings = payload.get("findings") or []
    stats = payload.get("stats") or {}
    coverage = (payload.get("coverage") or {}).get("sources") or []
    diff = payload.get("diff") or {}

    summary = [
        {"항목": "진단 대상", "값": payload.get("target_name", "")},
        {"항목": "모드", "값": payload.get("mode", "")},
        {"항목": "진단 일시", "값": payload.get("scanned_at", "")},
        {"항목": "전체", "값": stats.get("total", 0)},
        {"항목": "미흡", "값": stats.get("fail", 0)},
        {"항목": "미실행", "값": stats.get("not_scanned", 0)},
    ]
    for name, meta in (payload.get("scanners") or {}).items():
        summary.append({"항목": f"스캐너:{name}", "값": meta.get("summary") or meta.get("error", "")})
    if diff:
        summary.append({"항목": "diff 신규", "값": diff.get("new_count", 0)})
        summary.append({"항목": "diff 해소", "값": diff.get("resolved_count", 0)})

    rows = _findings_rows(findings)
    df_all = pd.DataFrame(rows, columns=FINDING_COLUMNS) if rows else pd.DataFrame(columns=FINDING_COLUMNS)

    security = df_all[df_all["룰셋"] == "findsecbugs"] if not df_all.empty else df_all
    pmd = df_all[df_all["룰셋"] == "pmd"] if not df_all.empty else df_all
    analog_df = df_all[df_all["룰셋"] == "analog"] if not df_all.empty else df_all
    not_scanned = df_all[df_all["상태"] == "미실행"] if not df_all.empty else df_all
    high = df_all[df_all["심각도"] == "높음"] if not df_all.empty else df_all

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        pd.DataFrame(summary).to_excel(writer, sheet_name="요약", index=False)
        df_all.to_excel(writer, sheet_name="전체", index=False)
        security.to_excel(writer, sheet_name="FindSecBugs_직접", index=False)
        pmd.to_excel(writer, sheet_name="PMD_직접", index=False)
        analog_df.to_excel(writer, sheet_name="Analog_PythonTS", index=False)
        not_scanned.to_excel(writer, sheet_name="미실행", index=False)
        high.to_excel(writer, sheet_name="심각도_높음", index=False)
        if coverage:
            pd.DataFrame(coverage).to_excel(writer, sheet_name="커버리지", index=False)
        if diff.get("new"):
            pd.DataFrame(_findings_rows(diff["new"])).to_excel(writer, sheet_name="Diff_신규", index=False)
        if diff.get("resolved"):
            pd.DataFrame(_findings_rows(diff["resolved"])).to_excel(writer, sheet_name="Diff_해소", index=False)
    return buf.getvalue()


def build_html_report(payload: dict[str, Any], *, with_cover: bool = True) -> str:
    cover = build_cover_html(payload) if with_cover else ""
    findings = payload.get("findings") or []
    stats = payload.get("stats") or {}
    rows = _findings_rows(findings)
    trs = ""
    for r in rows[:1000]:
        trs += "<tr>" + "".join(f"<td>{html_lib.escape(str(r.get(c, '')))}</td>" for c in FINDING_COLUMNS) + "</tr>"
    thead = "".join(f"<th>{html_lib.escape(c)}</th>" for c in FINDING_COLUMNS)
    cover_section = f'<iframe srcdoc="{html_lib.escape(cover)}" style="width:100%;height:420px;border:1px solid #ddd;margin-bottom:24px;"></iframe>' if with_cover else ""
    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/>
<title>소스코드·보안 진단 — {html_lib.escape(str(payload.get('target_name','')))}</title>
<style>
body{{font-family:system-ui,sans-serif;margin:24px;}}
table{{border-collapse:collapse;width:100%;font-size:13px;}}
th,td{{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top;}}
th{{background:#f0f0f0;}}
.stats{{display:flex;gap:16px;margin:16px 0;}}
.stat{{padding:12px 16px;background:#f8f8f8;border-radius:8px;}}
a{{color:#0366d6;}}
</style></head><body>
{cover_section}
<h1>소스코드·보안 진단 상세</h1>
<p>{html_lib.escape(str(payload.get('target_name','')))} · {html_lib.escape(str(payload.get('scanned_at','')))}</p>
<div class="stats">
  <div class="stat">전체 <strong>{stats.get('total',0)}</strong></div>
  <div class="stat">미흡 <strong>{stats.get('fail',0)}</strong></div>
  <div class="stat">미실행 <strong>{stats.get('not_scanned',0)}</strong></div>
</div>
<table><thead><tr>{thead}</tr></thead><tbody>{trs}</tbody></table>
</body></html>"""


def build_sarif_bytes(payload: dict[str, Any]) -> bytes:
    runs = []
    by_scanner: dict[str, list[dict[str, Any]]] = {}
    for f in payload.get("findings") or []:
        if f.get("status") != "fail":
            continue
        sc = f.get("scanner") or "unknown"
        by_scanner.setdefault(sc, []).append(f)

    for scanner, items in by_scanner.items():
        rules = []
        results = []
        rule_index: dict[str, int] = {}
        for f in items:
            rid = f.get("rule_id") or f.get("scanner_rule_id") or "UNKNOWN"
            if rid not in rule_index:
                rule_index[rid] = len(rules)
                rules.append(
                    {
                        "id": rid,
                        "name": rid,
                        "shortDescription": {"text": f.get("message", rid)[:200]},
                        "helpUri": f.get("reference_url") or "",
                    }
                )
            loc = f.get("location", "")
            file_path = loc.split(":")[0] if ":" in loc else loc
            line = 1
            if ":" in loc:
                try:
                    line = int(loc.rsplit(":", 1)[-1])
                except ValueError:
                    line = 1
            level = "warning"
            sev = f.get("severity", "medium")
            if sev == "high":
                level = "error"
            elif sev == "low":
                level = "note"
            results.append(
                {
                    "ruleId": rid,
                    "ruleIndex": rule_index[rid],
                    "level": level,
                    "message": {"text": f.get("message", rid)},
                    "locations": [
                        {
                            "physicalLocation": {
                                "artifactLocation": {"uri": file_path},
                                "region": {"startLine": line},
                            }
                        }
                    ],
                }
            )
        runs.append({"tool": {"driver": {"name": scanner, "rules": rules}}, "results": results})

    doc = {"version": "2.1.0", "$schema": "https://json.schemastore.org/sarif-2.1.0.json", "runs": runs}
    return json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8")


def build_zip_bytes(payload: dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("cover.html", build_cover_html(payload))
        zf.writestr("report.html", build_html_report(payload, with_cover=False))
        zf.writestr("report.xlsx", build_xlsx_bytes(payload))
        zf.writestr("report.sarif.json", build_sarif_bytes(payload))
        zf.writestr("result.json", json.dumps(payload, ensure_ascii=False, indent=2))
    return buf.getvalue()
