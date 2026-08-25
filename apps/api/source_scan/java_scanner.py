from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
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
        if not p.is_file():
            continue
        if sys.platform != "win32" and p.suffix.lower() in (".bat", ".cmd"):
            continue
        return p
    return None


def _pmd_bin_candidates() -> tuple[str, ...]:
    if sys.platform == "win32":
        return ("bin/pmd.bat", "bin/pmd.cmd", "bin/pmd")
    return ("bin/pmd", "bin/pmd.bat", "bin/pmd.cmd")


def _spotbugs_bin_candidates() -> tuple[str, ...]:
    if sys.platform == "win32":
        return ("bin/spotbugs.bat", "bin/spotbugs.cmd", "bin/spotbugs")
    return ("bin/spotbugs", "bin/spotbugs.bat", "bin/spotbugs.cmd")


def _which_tool_names(base: str) -> list[str]:
    if sys.platform == "win32":
        return [f"{base}.bat", f"{base}.cmd", base]
    return [base, f"{base}.bat"]


def _normalize_tool_exe(path: Path | None) -> Path | None:
    if not path or not path.is_file():
        return None
    if sys.platform != "win32" and path.suffix.lower() in (".bat", ".cmd"):
        return None
    return path


def pmd_executable() -> Path | None:
    home = os.environ.get("PMD_HOME", "").strip()
    names = _pmd_bin_candidates()
    if home:
        exe = _executable_in_home(Path(home), names)
        if exe:
            return exe
    discovered = _discover_tool_home("pmd-bin-*")
    if discovered:
        exe = _executable_in_home(discovered, names)
        if exe:
            return exe
    return _normalize_tool_exe(_tool_path("PMD_BIN", _which_tool_names("pmd")))


def spotbugs_executable() -> Path | None:
    home = os.environ.get("SPOTBUGS_HOME", "").strip()
    names = _spotbugs_bin_candidates()
    if home:
        exe = _executable_in_home(Path(home), names)
        if exe:
            return exe
    discovered = _discover_tool_home("spotbugs-*")
    if discovered:
        exe = _executable_in_home(discovered, names)
        if exe:
            return exe
    return _normalize_tool_exe(_tool_path("SPOTBUGS_BIN", _which_tool_names("spotbugs")))


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
    use_prebuilt_classes: bool = False,
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

        zip_classes = _find_existing_classes(root)
        effective_prebuilt = use_prebuilt_classes
        if zip_classes and not use_prebuilt_classes:
            _build_log(
                f"ZIP에 {zip_classes.relative_to(root)} 포함 — clean 후 재컴파일합니다"
            )
        elif zip_classes and use_prebuilt_classes:
            compat = _spotbugs_class_compat_error(zip_classes)
            if compat:
                effective_prebuilt = False
                _build_log(
                    f"ZIP class가 실행 JDK와 불일치 — 컴파일 생략 해제, clean 후 재컴파일"
                )

        classes_dir, compile_error = _try_compile(
            root,
            use_prebuilt=effective_prebuilt,
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
            compat_err = _spotbugs_class_compat_error(classes_dir)
            if compat_err:
                result.spotbugs_error = compat_err
                result.findings.append(not_scanned_finding(scanner="spotbugs", reason=compat_err))
                result.spotbugs_fail_count = 0
                if on_progress:
                    on_progress("findsecbugs_done", f"FindSecBugs 분석 불가 — {compat_err[:240]}")
            else:
                xml_out = root / ".spotbugs.xml"
                cmd = _build_spotbugs_cmd(
                    sb,
                    xml_out=xml_out,
                    plugin=plugin,
                    classes_dir=classes_dir,
                    spotbugs_effort=spotbugs_effort,
                )
                try:
                    proc = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                        timeout=600,
                        env=_spotbugs_run_env(),
                    )
                    if xml_out.is_file():
                        result.spotbugs_ran = True
                        _parse_spotbugs_xml(
                            xml_out,
                            root,
                            rel_prefix,
                            result,
                            exclude_globs,
                            threshold=spotbugs_threshold,
                        )
                    else:
                        log = _tail_output(proc.stderr) or _tail_output(proc.stdout)
                        result.spotbugs_error = _friendly_spotbugs_failure(log, proc.returncode)
                        result.findings.append(
                            not_scanned_finding(scanner="spotbugs", reason=result.spotbugs_error)
                        )
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


def _java_bin_major(java_bin: str | None) -> int | None:
    if not java_bin:
        return None
    try:
        proc = subprocess.run([java_bin, "-version"], capture_output=True, timeout=15)
        out = (proc.stderr or proc.stdout or b"").decode("utf-8", errors="replace")
        m = re.search(r'version "([^"]+)"', out)
        if not m:
            return None
        ver = m.group(1).strip()
        if ver.startswith("1."):
            return int(ver.split(".")[1])
        return int(ver.split(".")[0])
    except Exception:
        return None


def _java_home_major(java_home: str | Path | None) -> int | None:
    if not java_home:
        return None
    home = Path(java_home)
    java_bin = home / "bin" / ("java.exe" if sys.platform == "win32" else "java")
    if not java_bin.is_file():
        return None
    return _java_bin_major(str(java_bin))


def _discover_java_homes() -> list[Path]:
    found: list[Path] = []
    seen: set[str] = set()

    def add(home: str | Path | None) -> None:
        if not home:
            return
        p = Path(home)
        key = str(p.resolve()) if p.exists() else str(p)
        if key in seen:
            return
        java_bin = p / "bin" / ("java.exe" if sys.platform == "win32" else "java")
        if java_bin.is_file():
            seen.add(key)
            found.append(p)

    for key in ("SPOTBUGS_JAVA_HOME", "JAVA11_HOME", "JDK11_HOME"):
        add(os.environ.get(key, "").strip())
    add(os.environ.get("JAVA_HOME", "").strip())

    if sys.platform == "win32":
        for base in (
            Path(r"C:\Program Files\Eclipse Adoptium"),
            Path(r"C:\Program Files\Java"),
            Path(r"C:\Program Files\Microsoft"),
        ):
            if not base.is_dir():
                continue
            for child in sorted(base.glob("jdk-*"), reverse=True):
                add(child)
    else:
        for base in (Path("/usr/lib/jvm"), Path("/opt/java")):
            if not base.is_dir():
                continue
            for child in sorted(base.iterdir(), reverse=True):
                if child.is_dir():
                    add(child)
    return found


def _spotbugs_jar_path() -> Path | None:
    home = os.environ.get("SPOTBUGS_HOME", "").strip()
    if home:
        root = Path(home)
        for candidate in (root / "lib" / "spotbugs.jar", root / "spotbugs.jar"):
            if candidate.is_file():
                return candidate
    discovered = _discover_tool_home("spotbugs-*")
    if discovered:
        for candidate in (discovered / "lib" / "spotbugs.jar", discovered / "spotbugs.jar"):
            if candidate.is_file():
                return candidate
    return None


def _jar_entry_class_major(jar_path: Path, entry: str) -> int | None:
    import zipfile

    try:
        with zipfile.ZipFile(jar_path) as zf:
            data = zf.read(entry)
    except Exception:
        return None
    if len(data) < 8 or data[:4] != b"\xca\xfe\xba\xbe":
        return None
    return (data[6] << 8) | data[7]


def _class_major_to_java(major: int) -> int:
    if major >= 65:
        return 21
    if major >= 61:
        return 17
    if major >= 55:
        return 11
    if major >= 52:
        return 8
    return max(1, major - 44)


def _spotbugs_runtime_java_major() -> int:
    home = resolve_spotbugs_java_home()
    if home:
        major = _java_home_major(home)
        if major is not None:
            return major
    return _java_spec_major_version()


def _spotbugs_runtime_requirement() -> tuple[int, str]:
    jar = _spotbugs_jar_path()
    if jar:
        major = _jar_entry_class_major(jar, "edu/umd/cs/findbugs/LaunchAppropriateUI.class")
        if major:
            req = _class_major_to_java(major)
            ver = os.environ.get("SPOTBUGS_HOME", "")
            m = re.search(r"spotbugs[-/](\d+(?:\.\d+)*)", ver.replace("\\", "/"), re.I)
            label = m.group(1) if m else "4.x"
            return req, label
    return 11, "4.9+"


def resolve_spotbugs_java_home() -> Path | None:
    req_major, _ = _spotbugs_runtime_requirement()
    for home in _discover_java_homes():
        major = _java_home_major(home)
        if major is not None and major >= req_major:
            return home
    return None


def spotbugs_runtime_error() -> str | None:
    sb = spotbugs_executable()
    if not sb:
        return None
    req_major, sb_label = _spotbugs_runtime_requirement()
    home = resolve_spotbugs_java_home()
    if home:
        return None
    compile_major = _java_home_major(os.environ.get("JAVA_HOME", "").strip()) or _java_spec_major_version()
    return (
        f"SpotBugs {sb_label} 실행에 JDK {req_major}+ 필요 (현재 JAVA_HOME=JDK {compile_major}). "
        f"Eclipse Temurin {req_major} 설치 후 SPOTBUGS_JAVA_HOME 설정, "
        f"또는 SpotBugs 4.8.6.8 이하 + JDK 8 조합 사용."
    )


def _spotbugs_run_env() -> dict[str, str]:
    env = os.environ.copy()
    home = resolve_spotbugs_java_home()
    if home:
        env["JAVA_HOME"] = str(home)
    return env


def _java_spec_major_version() -> int:
    java_bin = _resolve_cli("java")
    if not java_bin:
        return 8
    try:
        proc = subprocess.run([java_bin, "-version"], capture_output=True, timeout=15)
        out = (proc.stderr or proc.stdout or b"").decode("utf-8", errors="replace")
        m = re.search(r'version "([^"]+)"', out)
        if not m:
            return 8
        ver = m.group(1).strip()
        if ver.startswith("1."):
            return int(ver.split(".")[1])
        return int(ver.split(".")[0])
    except Exception:
        return 8


def _class_major_version(class_path: Path) -> int | None:
    try:
        header = class_path.read_bytes()[:8]
        if len(header) < 8 or header[:4] != b"\xca\xfe\xba\xbe":
            return None
        return (header[6] << 8) | header[7]
    except Exception:
        return None


def _max_class_major_version(classes_dir: Path) -> int | None:
    found: int | None = None
    for cls in classes_dir.rglob("*.class"):
        major = _class_major_version(cls)
        if major is None:
            continue
        found = major if found is None else max(found, major)
    return found


def _major_to_java_label(major: int) -> str:
    labels = {52: "8", 55: "11", 61: "17", 65: "21"}
    return labels.get(major, str(major))


def _spotbugs_class_compat_error(classes_dir: Path) -> str | None:
    runtime_err = spotbugs_runtime_error()
    if runtime_err:
        return runtime_err
    class_major = _max_class_major_version(classes_dir)
    if class_major is None:
        return None
    runtime_major = _spotbugs_runtime_java_major()
    runtime_load_major = {8: 52, 9: 53, 10: 54, 11: 55, 17: 61, 21: 65}.get(
        runtime_major, 44 + runtime_major
    )
    if class_major <= runtime_load_major:
        return None
    return (
        f".class가 Java {_major_to_java_label(class_major)} (major {class_major})인데 "
        f"SpotBugs 실행 JDK는 Java {runtime_major} (major {runtime_load_major}까지 로드 가능). "
        f"「컴파일 생략」 해제 후 JDK {runtime_major}로 재빌드, 또는 SpotBugs용 JDK를 올리세요."
    )


def _friendly_spotbugs_failure(log: str, returncode: int) -> str:
    runtime_err = spotbugs_runtime_error()
    if runtime_err and (
        "LaunchAppropriateUI" in log
        or "edu/umd/cs/findbugs" in log
        or "UnsupportedClassVersionError" in log
    ):
        return runtime_err + (f" (exit {returncode})" if returncode else "")
    if "Unknown option: -threshold" in log:
        return (
            "SpotBugs 4.10+는 -threshold CLI 옵션을 지원하지 않습니다. "
            "threshold는 결과 필터로 적용됩니다 — API를 재시작한 뒤 다시 실행하세요."
        )
    if "ClassLoader.defineClass" in log or "UnsupportedClassVersionError" in log:
        return (
            f"SpotBugs가 .class를 로드하지 못함 (exit {returncode}) — "
            f"분석 대상 class 버전과 SpotBugs 실행 JDK가 맞지 않을 수 있습니다. "
            f"「컴파일 생략」 해제 후 재빌드하거나 SPOTBUGS_JAVA_HOME을 올리세요."
            + (f" 상세: {log[:200]}" if log else "")
        )
    return f"SpotBugs XML 미생성 (exit {returncode})" + (f": {log}" if log else "")


def _try_compile(
    root: Path,
    *,
    use_prebuilt: bool = False,
    on_build_log: Callable[[str], None] | None = None,
    is_cancelled: CancelFn = None,
) -> tuple[Path | None, str]:
    if is_cancelled and is_cancelled():
        return None, "사용자 취소"

    existing = _find_existing_classes(root)

    if use_prebuilt and existing:
        compat_err = _spotbugs_class_compat_error(existing)
        if compat_err is None:
            msg = f"기존 classes 사용: {existing.relative_to(root)}"
            if on_build_log:
                on_build_log(msg)
            return existing, ""
        if on_build_log:
            on_build_log(
                f"ZIP의 {existing.relative_to(root)}가 실행 JDK와 맞지 않아 재컴파일합니다"
            )

    force_clean = existing is not None

    pom = _find_root_pom(root)
    mvn = _resolve_cli("mvn")
    if pom and mvn:
        target = pom.parent / "target" / "classes"
        mvn_goals = ["clean", "compile"] if force_clean else ["compile"]
        try:
            if on_build_log:
                action = "mvn clean compile" if force_clean else "mvn compile"
                on_build_log(f"{action} — {pom.relative_to(root)}")
            proc = subprocess.run(
                [mvn, "-f", str(pom), "-q", *mvn_goals, "-DskipTests"],
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
        gradle_goals = ["clean", "classes"] if force_clean else ["classes"]
        try:
            if on_build_log:
                action = "gradle clean classes" if force_clean else "gradle classes"
                on_build_log(f"{action} — {gradle.parent.relative_to(root)}")
            proc = subprocess.run(
                [gradle_bin, "-q", *gradle_goals],
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


def _normalize_spotbugs_effort(effort: str) -> str:
    val = (effort or "max").strip().lower()
    if val in ("min", "less", "default", "more", "max"):
        return val
    return "max"


def _spotbugs_priority_allowed(priority: str, threshold: str) -> bool:
    """SpotBugs 4.10+ removed -threshold CLI; filter XML priorities instead."""
    try:
        pri = int(priority)
    except (TypeError, ValueError):
        pri = 2
    level = (threshold or "low").strip().lower()
    if level == "high":
        return pri <= 1
    if level == "medium":
        return pri <= 2
    return pri <= 3


def _build_spotbugs_cmd(
    sb: Path,
    *,
    xml_out: Path,
    plugin: Path,
    classes_dir: Path,
    spotbugs_effort: str,
) -> list[str]:
    effort = _normalize_spotbugs_effort(spotbugs_effort)
    return [
        str(sb),
        "-textui",
        "-xml:withMessages",
        "-output",
        str(xml_out),
        "-pluginList",
        str(plugin),
        f"-effort:{effort}",
        str(classes_dir),
    ]


def _parse_spotbugs_xml(
    xml_path: Path,
    root: Path,
    rel_prefix: str,
    result: JavaScanResult,
    exclude_globs: list[str] | None = None,
    *,
    threshold: str = "low",
) -> None:
    try:
        tree = ET.parse(xml_path)
        root_el = tree.getroot()
    except ET.ParseError:
        return
    for bug in root_el.findall(".//BugInstance"):
        typ = bug.get("type", "")
        priority = bug.get("priority", "2")
        if not _spotbugs_priority_allowed(priority, threshold):
            continue
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
