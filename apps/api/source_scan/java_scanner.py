from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from source_scan.exclude import filter_file_list, is_excluded_path
from source_scan.findings import normalize_finding, not_scanned_finding

ProgressFn = Callable[[str, str], None] | None
CancelFn = Callable[[], bool] | None


@dataclass
class JavaScanResult:
    findings: list[dict[str, Any]] = field(default_factory=list)
    scanned_files: set[str] = field(default_factory=set)
    pmd_available: bool = False
    spotbugs_available: bool = False
    pmd_error: str = ""
    spotbugs_error: str = ""
    pmd_ran: bool = False
    spotbugs_ran: bool = False
    pmd_fail_count: int = 0
    spotbugs_fail_count: int = 0
    jdk_hint: str = ""
    build_log: str = ""


def _tool_path(env_key: str, default_names: list[str]) -> Path | None:
    val = os.environ.get(env_key, "").strip()
    if val:
        p = Path(val)
        if p.is_file() or p.is_dir():
            return p
    for name in default_names:
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def _common_tools_dir() -> Path:
    custom = os.environ.get("SOURCE_SCAN_TOOLS_DIR", "").strip()
    if custom:
        return Path(custom)
    return Path("C:/tools")


def _discover_tool_home(glob_pattern: str) -> Path | None:
    base = _common_tools_dir()
    if not base.is_dir():
        return None
    matches = sorted(base.glob(glob_pattern), reverse=True)
    for candidate in matches:
        if candidate.is_dir():
            return candidate
    return None


def _executable_in_home(home: Path, names: tuple[str, ...]) -> Path | None:
    for sub in names:
        p = home / sub.replace("/", os.sep)
        if p.is_file():
            return p
    return None


def pmd_executable() -> Path | None:
    home = os.environ.get("PMD_HOME", "").strip()
    if home:
        exe = _executable_in_home(Path(home), ("bin/pmd.bat", "bin/pmd", "bin/pmd.cmd"))
        if exe:
            return exe
    discovered = _discover_tool_home("pmd-bin-*")
    if discovered:
        exe = _executable_in_home(discovered, ("bin/pmd.bat", "bin/pmd", "bin/pmd.cmd"))
        if exe:
            return exe
    return _tool_path("PMD_BIN", ["pmd", "pmd.bat"])


def spotbugs_executable() -> Path | None:
    home = os.environ.get("SPOTBUGS_HOME", "").strip()
    if home:
        exe = _executable_in_home(
            Path(home), ("bin/spotbugs.bat", "bin/spotbugs", "bin/spotbugs.cmd")
        )
        if exe:
            return exe
    discovered = _discover_tool_home("spotbugs-*")
    if discovered:
        exe = _executable_in_home(
            discovered, ("bin/spotbugs.bat", "bin/spotbugs", "bin/spotbugs.cmd")
        )
        if exe:
            return exe
    return _tool_path("SPOTBUGS_BIN", ["spotbugs", "spotbugs.bat"])


def findsecbugs_plugin() -> Path | None:
    val = os.environ.get("FINDSEC_BUGS_PLUGIN_JAR", "").strip()
    if val and Path(val).is_file():
        return Path(val)
    base = _common_tools_dir()
    if base.is_dir():
        jars = sorted(base.glob("findsecbugs*.jar"), reverse=True)
        if jars and jars[0].is_file():
            return jars[0]
    return None


def _resolve_cli(name: str) -> str | None:
    found = shutil.which(name)
    return found if found else None


def detect_jdk_hint(root: Path) -> str:
    java_home = os.environ.get("JAVA_HOME", "").strip()
    version_out = ""
    java_bin = _resolve_cli("java")
    if java_bin:
        try:
            proc = subprocess.run([java_bin, "-version"], capture_output=True, timeout=15)
            version_out = (proc.stderr or proc.stdout or b"").decode("utf-8", errors="replace")
        except Exception:
            pass
    m = re.search(r'version "([^"]+)"', version_out)
    ver = m.group(1) if m else "unknown"
    hint = f"JAVA_HOME={java_home or '(미설정)'} · java -version={ver.strip()}"
    for pom in root.rglob("pom.xml"):
        try:
            text = pom.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "nashorn" in text.lower() or "jdk8" in text.lower() or "1.8" in text:
            hint += " · 레거시 프로젝트: JDK 8/11 권장"
            break
        m2 = re.search(r"<maven\.compiler\.(?:source|target)>([^<]+)", text)
        if m2:
            hint += f" · pom compiler={m2.group(1).strip()}"
            break
    return hint


def scan_java_tree(
    root: Path,
    *,
    rel_prefix: str = "",
    try_build: bool = True,
    on_progress: ProgressFn = None,
    is_cancelled: CancelFn = None,
    exclude_globs: list[str] | None = None,
    pmd_rulesets: str | None = None,
    use_prebuilt_classes: bool = True,
    spotbugs_effort: str = "max",
    spotbugs_threshold: str = "low",
) -> JavaScanResult:
    java_files = filter_file_list(list(root.rglob("*.java")), root, exclude_globs)
    if not java_files:
        return JavaScanResult()

    result = JavaScanResult(jdk_hint=detect_jdk_hint(root))
    rel_set = {str(p.relative_to(root)).replace("\\", "/") for p in java_files}

    def _cancelled() -> bool:
        return bool(is_cancelled and is_cancelled())

    pmd = pmd_executable()
    rulesets = pmd_rulesets or os.environ.get(
        "PMD_RULESETS",
        "category/java/bestpractices.xml,category/java/errorprone.xml,category/java/security.xml",
    )
    if pmd:
        if _cancelled():
            return result
        if on_progress:
            on_progress("pmd", f"PMD 분석 중… ({len(java_files)}개 Java 파일)")
        result.pmd_available = True
        out_json = root / ".pmd_result.json"
        cmd = [
            str(pmd),
            "check",
            "-d",
            str(root),
            "-R",
            rulesets,
            "-f",
            "json",
            "-r",
            str(out_json),
        ]
        # 제외는 PMD CLI --exclude 대신 결과 후처리(is_excluded_path)만 사용.
        # (--exclude에 glob 목록을 넘기면 PMD 7에서 실패하고 JSON이 생성되지 않을 수 있음)
        try:
            proc = subprocess.run(
                cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300
            )
            if out_json.is_file():
                result.pmd_ran = True
                data = json.loads(out_json.read_text(encoding="utf-8", errors="ignore"))
                for f in data.get("files") or []:
                    fname = f.get("filename", "")
                    try:
                        rel = str(Path(fname).resolve().relative_to(root.resolve())).replace("\\", "/")
                    except Exception:
                        rel = Path(fname).name
                    if is_excluded_path(root / rel, root, exclude_globs):
                        continue
                    if rel_prefix:
                        rel = f"{rel_prefix}/{rel}".lstrip("/")
                    for v in f.get("violations") or []:
                        rule_id = v.get("rule") or v.get("ruleset", "PMD")
                        line = v.get("beginline", 0)
                        pri = v.get("priority") or 3
                        sev = "high" if pri <= 2 else "medium" if pri == 3 else "low"
                        result.scanned_files.add(rel)
                        result.findings.append(
                            normalize_finding(
                                location=f"{rel}:{line}",
                                message=v.get("description", rule_id),
                                scanner="pmd",
                                scanner_rule_id=rule_id,
                                severity=sev,
                                rule_set="pmd",
                                rule_id=rule_id,
                                category="java",
                                language="java",
                            )
                        )
            else:
                err = _tail_output(proc.stderr) or _tail_output(proc.stdout)
                reason = f"PMD 실패 (exit {proc.returncode})"
                if err:
                    reason += f": {err}"
                if "Cannot resolve rule" in err or "Unknown ruleset" in err:
                    reason += " — ruleset 경로 확인 (category/java/….xml 형식, 쉼표 구분)"
                result.pmd_error = reason
                result.findings.append(not_scanned_finding(scanner="pmd", reason=reason))
        except Exception as e:
            result.pmd_error = str(e)
            result.findings.append(not_scanned_finding(scanner="pmd", reason=str(e)))
        result.pmd_fail_count = sum(
            1 for f in result.findings if f.get("scanner") == "pmd" and f.get("status") == "fail"
        )
        if on_progress:
            if result.pmd_ran:
                label = f"결함 {result.pmd_fail_count}건" if result.pmd_fail_count else "결함 없음"
                on_progress("pmd_done", f"PMD 완료 — {label}")
            else:
                reason = (result.pmd_error or "분석 실패")[:240]
                on_progress("pmd_done", f"PMD 분석 불가 — {reason}")
    else:
        msg = "PMD CLI 없음 — PMD_HOME 또는 PATH 설정 (docs/source-scan-setup.md)"
        result.pmd_error = msg
        result.findings.append(not_scanned_finding(scanner="pmd", reason=msg))
        if on_progress:
            on_progress("pmd_done", f"PMD 분석 불가 — {msg}")

    sb = spotbugs_executable()
    plugin = findsecbugs_plugin()
    if sb and plugin and try_build:
        if _cancelled():
            return result
        if on_progress:
            on_progress("java_build", "Java 빌드 중 (Maven/Gradle)…")

        def _build_log(msg: str) -> None:
            result.build_log = msg
            if on_progress:
                on_progress("java_build", msg[:500])

        classes_dir, compile_error = _try_compile(
            root,
            use_prebuilt=use_prebuilt_classes,
            on_build_log=_build_log,
            is_cancelled=is_cancelled,
        )
        result.spotbugs_available = True
        if classes_dir:
            if on_progress:
                on_progress("java_build_done", "빌드 완료")
            if _cancelled():
                return result
            if on_progress:
                on_progress("findsecbugs", "FindSecBugs(SpotBugs) 분석 중…")
            xml_out = root / ".spotbugs.xml"
            cmd = [
                str(sb),
                "-textui",
                "-xml:withMessages",
                "-output",
                str(xml_out),
                "-pluginList",
                str(plugin),
                f"-effort:{spotbugs_effort}",
                f"-threshold:{spotbugs_threshold}",
            ]
            cmd.append(str(classes_dir))
            try:
                subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
                if xml_out.is_file():
                    result.spotbugs_ran = True
                    _parse_spotbugs_xml(xml_out, root, rel_prefix, result, exclude_globs)
            except Exception as e:
                result.spotbugs_error = str(e)
                result.findings.append(not_scanned_finding(scanner="spotbugs", reason=str(e)))
            result.spotbugs_fail_count = sum(
                1 for f in result.findings if f.get("rule_set") == "findsecbugs" and f.get("status") == "fail"
            )
            if on_progress:
                if result.spotbugs_ran:
                    label = f"결함 {result.spotbugs_fail_count}건" if result.spotbugs_fail_count else "결함 없음"
                    on_progress("findsecbugs_done", f"FindSecBugs 완료 — {label}")
                else:
                    reason = (result.spotbugs_error or "분석 실패")[:240]
                    on_progress("findsecbugs_done", f"FindSecBugs 분석 불가 — {reason}")
        else:
            reason = compile_error or "컴파일 실패 또는 pom.xml/build.gradle 없음"
            result.spotbugs_error = f"Java 컴파일 실패 — {reason}"
            result.findings.append(not_scanned_finding(scanner="spotbugs", reason=reason))
            if on_progress:
                on_progress("java_build_done", reason[:240])
                on_progress("findsecbugs_done", f"FindSecBugs 분석 불가 — {reason[:200]}")
    elif not sb and not plugin:
        msg = "SpotBugs·findsecbugs-plugin 미설정 — SPOTBUGS_HOME, FINDSEC_BUGS_PLUGIN_JAR"
        result.spotbugs_error = msg
        result.findings.append(not_scanned_finding(scanner="spotbugs", reason=msg))
        if on_progress:
            on_progress("findsecbugs_done", f"FindSecBugs 분석 불가 — {msg}")
    elif not sb:
        msg = "SpotBugs 없음 — SPOTBUGS_HOME 또는 PATH 설정"
        result.spotbugs_error = msg
        result.findings.append(not_scanned_finding(scanner="spotbugs", reason=msg))
        if on_progress:
            on_progress("findsecbugs_done", f"FindSecBugs 분석 불가 — {msg}")
    elif not plugin:
        msg = "findsecbugs-plugin JAR 없음 — FINDSEC_BUGS_PLUGIN_JAR 설정"
        result.spotbugs_error = msg
        result.findings.append(not_scanned_finding(scanner="spotbugs", reason=msg))
        if on_progress:
            on_progress("findsecbugs_done", f"FindSecBugs 분석 불가 — {msg}")
    elif not try_build:
        msg = "FindSecBugs 빌드 옵션 꺼짐"
        result.spotbugs_error = msg
        result.findings.append(not_scanned_finding(scanner="spotbugs", reason=msg))
        if on_progress:
            on_progress("findsecbugs_done", f"FindSecBugs 분석 불가 — {msg}")

    for rel in rel_set:
        full = f"{rel_prefix}/{rel}".lstrip("/") if rel_prefix else rel
        if full not in result.scanned_files and not any(
            x.get("location", "").startswith(full) for x in result.findings if x.get("status") == "fail"
        ):
            result.scanned_files.add(full)

    return result


def _find_root_pom(root: Path) -> Path | None:
    poms = [p for p in root.rglob("pom.xml") if p.is_file()]
    if not poms:
        return None
    poms.sort(key=lambda p: (len(p.relative_to(root).parts), len(str(p))))
    for pom in poms:
        depth = len(pom.relative_to(root).parts)
        if depth <= 2:
            return pom
    return poms[0]


def _find_existing_classes(root: Path) -> Path | None:
    candidates: list[tuple[int, Path]] = []
    for pattern in ("target/classes", "build/classes/java/main"):
        for classes in root.rglob(pattern.replace("/", os.sep)):
            if classes.is_dir() and any(classes.rglob("*.class")):
                candidates.append((len(classes.relative_to(root).parts), classes))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0])
    return candidates[0][1]


def _tail_output(data: bytes | str | None, limit: int = 800) -> str:
    if not data:
        return ""
    text = data.decode("utf-8", errors="replace") if isinstance(data, bytes) else data
    text = text.strip()
    if len(text) <= limit:
        return text
    return "…" + text[-limit:]


def _try_compile(
    root: Path,
    *,
    use_prebuilt: bool = True,
    on_build_log: Callable[[str], None] | None = None,
    is_cancelled: CancelFn = None,
) -> tuple[Path | None, str]:
    if is_cancelled and is_cancelled():
        return None, "사용자 취소"

    if use_prebuilt:
        existing = _find_existing_classes(root)
        if existing:
            msg = f"기존 classes 사용: {existing.relative_to(root)}"
            if on_build_log:
                on_build_log(msg)
            return existing, ""

    pom = _find_root_pom(root)
    mvn = _resolve_cli("mvn")
    if pom and mvn:
        target = pom.parent / "target" / "classes"
        try:
            if on_build_log:
                on_build_log(f"mvn compile — {pom.relative_to(root)}")
            proc = subprocess.run(
                [mvn, "-f", str(pom), "-q", "compile", "-DskipTests"],
                cwd=str(pom.parent),
                capture_output=True,
                timeout=600,
            )
            log = _tail_output(proc.stderr) or _tail_output(proc.stdout)
            if on_build_log and log:
                on_build_log(f"mvn exit {proc.returncode}: {log[:400]}")
            if target.is_dir() and any(target.rglob("*.class")):
                return target, ""
            err = log
            if proc.returncode != 0:
                return None, f"mvn compile 실패 (exit {proc.returncode}){': ' + err if err else ''}"
            return None, "mvn compile 완료했으나 target/classes 없음"
        except subprocess.TimeoutExpired:
            return None, "mvn compile 시간 초과 (600s)"
        except Exception as e:
            return None, f"mvn 실행 오류: {e}"

    gradle = next((p for p in root.rglob("build.gradle*") if p.is_file()), None)
    gradle_bin = _resolve_cli("gradle")
    if gradle and gradle_bin:
        try:
            proc = subprocess.run(
                [gradle_bin, "-q", "classes"],
                cwd=str(gradle.parent),
                capture_output=True,
                timeout=600,
            )
            log = _tail_output(proc.stderr) or _tail_output(proc.stdout)
            if on_build_log and log:
                on_build_log(f"gradle exit {proc.returncode}: {log[:400]}")
            for classes in gradle.parent.rglob("build/classes/java/main"):
                if classes.is_dir():
                    return classes, ""
            if proc.returncode != 0:
                return None, f"gradle classes 실패 (exit {proc.returncode}){': ' + log if log else ''}"
            return None, "gradle classes 완료했으나 build/classes/java/main 없음"
        except subprocess.TimeoutExpired:
            return None, "gradle classes 시간 초과 (600s)"
        except Exception as e:
            return None, f"gradle 실행 오류: {e}"

    if not pom and not gradle:
        return None, "pom.xml/build.gradle 없음"
    if pom and not mvn:
        return None, "mvn CLI 없음 — PATH 또는 M2_HOME 설정"
    if gradle and not gradle_bin:
        return None, "gradle CLI 없음 — PATH 설정"
    return None, "컴파일 실패"


def _parse_spotbugs_xml(
    xml_path: Path,
    root: Path,
    rel_prefix: str,
    result: JavaScanResult,
    exclude_globs: list[str] | None = None,
) -> None:
    try:
        tree = ET.parse(xml_path)
        root_el = tree.getroot()
    except ET.ParseError:
        return
    for bug in root_el.findall(".//BugInstance"):
        typ = bug.get("type", "")
        priority = bug.get("priority", "2")
        sev = "high" if priority == "1" else "medium" if priority == "2" else "low"
        source_line = bug.find(".//SourceLine")
        if source_line is None:
            continue
        srcfile = source_line.get("sourcepath") or source_line.get("pathname") or "unknown"
        line = source_line.get("start") or source_line.get("line") or "0"
        rel = srcfile.replace("\\", "/")
        if is_excluded_path(root / rel, root, exclude_globs):
            continue
        if rel_prefix:
            rel = f"{rel_prefix}/{rel}".lstrip("/")
        msg_el = bug.find("LongMessage")
        message = msg_el.text if msg_el is not None and msg_el.text else typ
        result.scanned_files.add(rel)
        result.findings.append(
            normalize_finding(
                location=f"{rel}:{line}",
                message=message,
                scanner="spotbugs",
                scanner_rule_id=typ,
                severity=sev,
                rule_set="findsecbugs",
                rule_id=typ,
                category="security",
                language="java",
            )
        )
