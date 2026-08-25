"""One-off: extract PMD / FindSecBugs rule IDs from uploaded HTML reference files."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

RULES_DIR = Path(__file__).resolve().parent.parent / "rules"
UPLOADS = Path(r"C:\Users\geotwo\.cursor\projects\c-Mywork-MyPlatform\uploads")
if not UPLOADS.is_dir():
    UPLOADS = Path(__file__).resolve().parents[4] / ".cursor" / "projects" / "c-Mywork-MyPlatform" / "uploads"


def extract_findsecbugs(html: str) -> list[dict]:
    rules: list[dict] = []
    seen: set[str] = set()
    for m in re.finditer(
        r"<a[^>]+href=\"#[^\"]+\"[^>]*>([^<]+)</a>\s*\(([A-Z0-9_]+)\)",
        html,
    ):
        title, rid = m.group(1).strip(), m.group(2)
        if rid in seen:
            continue
        seen.add(rid)
        rules.append(_fsb_entry(rid, title))
    for m in re.finditer(r"\*[^\n(]+\(([A-Z0-9\\_]+)\)", html):
        rid = m.group(1).replace("\\_", "_").replace("_", "_")
        if rid in seen:
            continue
        seen.add(rid)
        title = rid.replace("_", " ").title()
        rules.append(_fsb_entry(rid, title))
    return rules


def _fsb_entry(rid: str, title: str) -> dict:
    return {
        "id": rid,
        "title": title,
        "ruleset": "findsecbugs",
        "category": "security",
        "reference_url": f"https://find-sec-bugs.github.io/bugs.htm#{rid}",
    }


def extract_pmd(html: str) -> list[dict]:
    rules: list[dict] = []
    seen: set[str] = set()
    for m in re.finditer(r'<a[^>]+href="([A-Za-z0-9_]+)\.html"[^>]*>([^<]+)</a>', html):
        rid, title = m.group(1), m.group(2).strip()
        if rid in seen or len(rid) < 3:
            continue
        seen.add(rid)
        rules.append(
            {
                "id": rid,
                "title": title,
                "ruleset": "pmd",
                "category": "java",
                "reference_url": f"https://docs.pmd-code.org/latest/pmd_rules_java_{rid.lower()}.html",
            }
        )
    return rules


def main() -> None:
    RULES_DIR.mkdir(parents=True, exist_ok=True)
    fsb_path = UPLOADS / "bugs-0.htm"
    pmd_path = UPLOADS / "pmd_rules_java-1.html"

    fsb = []
    pmd = []
    if fsb_path.is_file():
        fsb = extract_findsecbugs(fsb_path.read_text(encoding="utf-8", errors="ignore"))
    if pmd_path.is_file():
        pmd = extract_pmd(pmd_path.read_text(encoding="utf-8", errors="ignore"))

    if not fsb:
        fsb = _default_fsb()
    if not pmd:
        pmd = _default_pmd()

    (RULES_DIR / "findsecbugs.json").write_text(
        json.dumps(fsb, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (RULES_DIR / "pmd_java.json").write_text(
        json.dumps(pmd, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"findsecbugs: {len(fsb)}, pmd: {len(pmd)}")


def _default_fsb() -> list[dict]:
    ids = [
        "SQL_INJECTION", "COMMAND_INJECTION", "PATH_TRAVERSAL_IN", "PATH_TRAVERSAL_OUT",
        "WEAK_MESSAGE_DIGEST_MD5", "WEAK_MESSAGE_DIGEST_SHA1", "HARD_CODE_PASSWORD",
        "PREDICTABLE_RANDOM", "XXE_DOCUMENT", "XPATH_INJECTION", "LDAP_INJECTION",
        "SPRING_CSRF_PROTECTION_DISABLED", "COOKIE_USAGE", "SERVLET_PARAMETER",
    ]
    return [
        {"id": i, "title": i.replace("_", " ").title(), "ruleset": "findsecbugs", "category": "security"}
        for i in ids
    ]


def _default_pmd() -> list[dict]:
    ids = [
        "GuardLogStatement", "EmptyCatchBlock", "AvoidReassigningParameters",
        "UseEqualsToCompareStrings", "CloseResource", "UnusedLocalVariable",
        "AvoidDuplicateLiterals", "LawOfDemeter", "ClassWithOnlyPrivateConstructorsShouldBeFinal",
    ]
    return [
        {"id": i, "title": i, "ruleset": "pmd", "category": "java"}
        for i in ids
    ]


if __name__ == "__main__":
    main()
