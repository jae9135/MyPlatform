"""행안부 공통표준단어/용어 ↔ 테이블정의서 점검 도구."""

from __future__ import annotations

import argparse
import json
import pickle
import re
import shutil
import tempfile
import threading
import warnings
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pandas as pd

DEFAULT_DIR = Path(__file__).resolve().parent
DEFAULT_DESIGN = DEFAULT_DIR / "테이블정의서.xlsx"
# Bundled under apps/api/chkdbstd (ASCII names for cloud deploy)
DEFAULT_WORDS = DEFAULT_DIR / "mois_standard_words.csv"
DEFAULT_TERMS = DEFAULT_DIR / "mois_standard_terms.csv"
DEFAULT_DOMAINS = DEFAULT_DIR / "mois_standard_domains.csv"
DEFAULT_CODE_DESIGN = DEFAULT_DIR / "코드정의서.xlsx"
DEFAULT_CODE_DIR = DEFAULT_DIR / "code_download" / "downloads"
DEFAULT_WORD_XLSX = DEFAULT_DIR / "표준단어매칭결과.xlsx"
DEFAULT_TERM_XLSX = DEFAULT_DIR / "표준용어매칭결과.xlsx"
DEFAULT_DOMAIN_XLSX = DEFAULT_DIR / "표준도메인매칭결과.xlsx"
DEFAULT_CODE_XLSX = DEFAULT_DIR / "표준코드매칭결과.xlsx"
DEFAULT_WORD_DICT_XLSX = DEFAULT_DIR / "사용표준단어집.xlsx"
DEFAULT_TERM_DICT_XLSX = DEFAULT_DIR / "사용표준용어집.xlsx"
DEFAULT_HTML = DEFAULT_DIR / "표준단어매칭결과.html"
DEFAULT_PORT = 8765

CODE_RESULT_COLS = [
    "코드명한글",
    "코드명영문",
    "설계코드값",
    "설계코드값의미",
    "설계비고",
    "표준코드명",
    "표준파일명",
    "표준코드값",
    "표준코드값의미",
    "코드명매칭",
    "판정",
    "사유",
]

WORD_MATCH_COLS = [
    "설계서No",
    "한글테이블명",
    "한글컬럼명",
    "영문컬럼명",
    "표준단어행번호",
    "매칭표준단어명",
    "표준단어영문약어명",
    "매칭순서",
    "권장영문명",
    "영문일치",
    "사유",
]
TERM_MATCH_COLS = [
    "설계서No",
    "한글테이블명",
    "한글컬럼명",
    "영문컬럼명",
    "출처",
    "표준행번호",
    "매칭표준명",
    "표준영문약어명",
    "매칭순서",
    "권장영문명",
    "영문일치",
    "사유",
]
DOMAIN_RESULT_COLS = [
    "설계서No",
    "한글테이블명",
    "한글컬럼명",
    "영문컬럼명",
    "설계데이터타입",
    "설계데이터길이",
    "표준용어명",
    "표준영문약어명",
    "권장영문명",
    "영문일치",
    "도메인명",
    "도메인데이터타입",
    "도메인데이터길이",
    "판정",
    "사유",
]
UNMATCH_COLS = ["설계서No", "한글테이블명", "한글컬럼명", "영문컬럼명"]
UNABLE_COLS = [
    "설계서No",
    "한글테이블명",
    "한글컬럼명",
    "영문컬럼명",
    "설계데이터타입",
    "설계데이터길이",
    "사유",
]

ORACLE_TO_DOMAIN_TYPE = {
    "VARCHAR2": "VARCHAR",
    "CLOB": "VARCHAR",
    "CHAR": "CHAR",
    "NUMBER": "NUMERIC",
    "DATE": "DATETIME",
}


def load_design(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name="테이블정의서", header=2)
    required = ["No", "한글 테이블명", "영문 테이블명", "한글 컬럼명", "영문 컬럼명"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"테이블정의서에 필요한 컬럼이 없습니다: {missing}")
    df = df.dropna(subset=["한글 컬럼명"]).copy()
    df["한글 컬럼명"] = df["한글 컬럼명"].astype(str).str.strip()
    df["영문 컬럼명"] = df["영문 컬럼명"].fillna("").astype(str).str.strip()
    if "데이터 타입" in df.columns:
        df["데이터 타입"] = df["데이터 타입"].fillna("").astype(str).str.strip().str.upper()
    else:
        df["데이터 타입"] = ""
    if "데이터 길이" in df.columns:
        df["데이터 길이"] = pd.to_numeric(df["데이터 길이"], errors="coerce")
    else:
        df["데이터 길이"] = pd.NA
    return df


def load_standard_words(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8-sig").copy()
    df["표준단어행번호"] = df.index + 1
    df["공통표준단어명"] = df["공통표준단어명"].astype(str).str.strip()
    return df.drop_duplicates(subset=["공통표준단어명"], keep="first")


def load_standard_terms(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8-sig").copy()
    name_col = df.columns[0]  # 공통표준용어명
    df["표준용어행번호"] = df.index + 1
    df[name_col] = df[name_col].astype(str).str.strip()
    df = df.rename(columns={name_col: "공통표준용어명"})
    if "공통표준도메인명" in df.columns:
        df["공통표준도메인명"] = df["공통표준도메인명"].fillna("").astype(str).str.strip()
    return df.drop_duplicates(subset=["공통표준용어명"], keep="first")


def load_standard_domains(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8-sig").copy()
    df["공통표준도메인명"] = df["공통표준도메인명"].astype(str).str.strip()
    df["데이터타입"] = df["데이터타입"].fillna("").astype(str).str.strip().str.upper()
    df["데이터길이"] = pd.to_numeric(df["데이터길이"], errors="coerce")
    return df


def map_oracle_to_domain_type(oracle_type: str) -> str | None:
    t = (oracle_type or "").strip().upper()
    if not t:
        return None
    if t in ORACLE_TO_DOMAIN_TYPE:
        return ORACLE_TO_DOMAIN_TYPE[t]
    # MDSYS.SDO_GEOMETRY 등
    if t.startswith("VARCHAR"):
        return "VARCHAR"
    return None


def resolve_domain_row(
    domains_df: pd.DataFrame, domain_name: str, mapped_type: str | None
) -> dict | None:
    rows = domains_df[domains_df["공통표준도메인명"] == domain_name]
    if rows.empty:
        return None
    if mapped_type:
        typed = rows[rows["데이터타입"] == mapped_type]
        if not typed.empty:
            r = typed.iloc[0]
            return {
                "도메인명": domain_name,
                "도메인데이터타입": str(r["데이터타입"]),
                "도메인데이터길이": r["데이터길이"],
            }
    r = rows.iloc[0]
    return {
        "도메인명": domain_name,
        "도메인데이터타입": str(r["데이터타입"]),
        "도메인데이터길이": r["데이터길이"],
    }


def eng_tokens(name: str) -> list[str]:
    return [t for t in re.split(r"[_\s]+", str(name or "").strip().upper()) if t]


def recommended_eng_name(abbrs: list[str]) -> str:
    """표준 약어들을 '_'로 연결. 용어 약어가 이미 GROUP_NM 형태면 토큰으로 분해 후 재결합."""
    parts: list[str] = []
    for a in abbrs:
        if a is None:
            continue
        s = str(a).strip().upper()
        if s:
            parts.extend(eng_tokens(s))
    return "_".join(parts)


def eng_abbr_sequence_matches(design_eng: str, abbrs: list[str]) -> bool:
    """설계 영문컬럼 토큰 시퀀스 == 표준 영문약어 토큰 시퀀스.

    표준용어 약어가 GROUP_NM처럼 '_'를 포함해도 토큰 단위로 비교한다.
    """
    expected: list[str] = []
    for a in abbrs:
        if a is None:
            continue
        s = str(a).strip().upper()
        if s:
            expected.extend(eng_tokens(s))
    if not expected:
        return False
    return eng_tokens(design_eng) == expected


def check_domains(
    design_df: pd.DataFrame, terms_df: pd.DataFrame, domains_df: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """용어 완전일치 → 도메인+영문 비교.

    매칭: 영문일치 + 타입/길이 적합
    확인필요: 용어는 있으나 영문불일치 또는 타입/길이 부적합
    미매칭: 표준용어 없음
    """
    term_info: dict[str, tuple[str, str]] = {}  # name -> (domain, eng_abbr)
    abbr_col = "공통표준용어영문약어명"
    for _, r in terms_df.iterrows():
        name = r["공통표준용어명"]
        if not name or name == "nan" or name in term_info:
            continue
        dname = r.get("공통표준도메인명", "")
        if pd.isna(dname):
            dname = ""
        abbr = r[abbr_col] if abbr_col in r and pd.notna(r[abbr_col]) else ""
        term_info[name] = (str(dname).strip(), str(abbr))

    match_rows: list[dict] = []
    review_rows: list[dict] = []
    unmatched_rows: list[dict] = []

    for _, row in design_df.iterrows():
        kor_col = row["한글 컬럼명"]
        eng_col = row["영문 컬럼명"]
        design_type = str(row.get("데이터 타입", "") or "")
        design_len = row.get("데이터 길이")
        base = {
            "설계서No": row["No"],
            "한글테이블명": row["한글 테이블명"],
            "영문테이블명": row["영문 테이블명"],
            "한글컬럼명": kor_col,
            "영문컬럼명": eng_col,
            "설계데이터타입": design_type,
            "설계데이터길이": "" if pd.isna(design_len) else design_len,
        }

        if kor_col not in term_info:
            unmatched_rows.append({**base, "사유": "표준용어 미매칭"})
            continue

        domain_name, term_abbr = term_info[kor_col]
        recommended = recommended_eng_name([term_abbr])
        eng_ok = eng_abbr_sequence_matches(eng_col, [term_abbr])
        reasons: list[str] = []
        if not eng_ok:
            reasons.append("영문약어불일치")

        if not domain_name:
            review_rows.append(
                {
                    **base,
                    "표준용어명": kor_col,
                    "표준영문약어명": term_abbr,
                    "권장영문명": recommended,
                    "영문일치": "Y" if eng_ok else "N",
                    "도메인명": "",
                    "도메인데이터타입": "",
                    "도메인데이터길이": "",
                    "판정": "확인필요",
                    "사유": ",".join(reasons + ["표준용어에 도메인 미지정"]),
                }
            )
            continue

        mapped = map_oracle_to_domain_type(design_type)
        dinfo = resolve_domain_row(domains_df, domain_name, mapped)
        if not dinfo:
            review_rows.append(
                {
                    **base,
                    "표준용어명": kor_col,
                    "표준영문약어명": term_abbr,
                    "권장영문명": recommended,
                    "영문일치": "Y" if eng_ok else "N",
                    "도메인명": domain_name,
                    "도메인데이터타입": "",
                    "도메인데이터길이": "",
                    "판정": "확인필요",
                    "사유": ",".join(reasons + ["도메인정의없음"]),
                }
            )
            continue

        dom_type = dinfo["도메인데이터타입"]
        dom_len = dinfo["도메인데이터길이"]
        if mapped is None or mapped != dom_type:
            reasons.append("타입불일치")
        if pd.notna(dom_len) and pd.notna(design_len) and float(design_len) > float(dom_len):
            reasons.append("길이초과")

        result_row = {
            **base,
            "표준용어명": kor_col,
            "표준영문약어명": term_abbr,
            "권장영문명": recommended,
            "영문일치": "Y" if eng_ok else "N",
            "도메인명": dinfo["도메인명"],
            "도메인데이터타입": dom_type,
            "도메인데이터길이": "" if pd.isna(dom_len) else dom_len,
            "판정": "매칭" if not reasons else "확인필요",
            "사유": ",".join(reasons),
        }
        if reasons:
            review_rows.append(result_row)
        else:
            match_rows.append(result_row)

    return (
        pd.DataFrame(match_rows),
        pd.DataFrame(review_rows),
        pd.DataFrame(unmatched_rows),
    )


def save_domain_excel(
    match_df: pd.DataFrame,
    review_df: pd.DataFrame,
    unmatched_df: pd.DataFrame,
    path: Path,
) -> None:
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        (
            match_df if not match_df.empty else pd.DataFrame(columns=DOMAIN_RESULT_COLS)
        ).to_excel(writer, sheet_name="매칭", index=False)
        (
            review_df if not review_df.empty else pd.DataFrame(columns=DOMAIN_RESULT_COLS)
        ).to_excel(writer, sheet_name="확인필요", index=False)
        (
            unmatched_df
            if not unmatched_df.empty
            else pd.DataFrame(columns=UNABLE_COLS)
        ).to_excel(writer, sheet_name="미매칭", index=False)


def run_domain_check(
    design_path: Path, terms_path: Path, domains_path: Path
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    design_df = load_design(design_path)
    terms_df = load_standard_terms(terms_path)
    domains_df = load_standard_domains(domains_path)
    match_df, review_df, unmatched_df = check_domains(
        design_df, terms_df, domains_df
    )
    if not unmatched_df.empty:
        for col in UNABLE_COLS:
            if col not in unmatched_df.columns:
                unmatched_df[col] = ""
    payload = {
        "stats": {
            "total_cols": int(len(design_df)),
            "matched_cols": int(len(match_df)),
            "review_cols": int(len(review_df)),
            "unmatched_cols": int(len(unmatched_df)),
            "match_rows": int(len(match_df)),
            "review_rows": int(len(review_df)),
        },
        "match": _records(match_df, DOMAIN_RESULT_COLS),
        "review": _records(review_df, DOMAIN_RESULT_COLS),
        "unmatch": _records(unmatched_df, UNABLE_COLS)
        if not unmatched_df.empty
        else [],
    }
    return match_df, review_df, unmatched_df, payload


def build_word_lookup(words_df: pd.DataFrame) -> list[tuple[str, int, str]]:
    abbr_col = "공통표준단어영문약어명"
    rows: list[tuple[str, int, str]] = []
    for _, r in words_df.iterrows():
        name = r["공통표준단어명"]
        if not name or name == "nan":
            continue
        abbr = r[abbr_col] if pd.notna(r[abbr_col]) else ""
        rows.append((name, int(r["표준단어행번호"]), str(abbr)))
    rows.sort(key=lambda x: len(x[0]), reverse=True)
    return rows


def longest_match_segment(
    text: str, word_lookup: list[tuple[str, int, str]]
) -> list[tuple[str, int, str]]:
    """좌→우 최장일치. 가능하면 한글을 빈틈없이 덮는 분할을 선택(백트래킹).

    예: 양도양수인가위임용량 → 양도+양수+인가+위임+용량
    (탐욕만 쓰면 양수인에 잡혀 '가'가 누락됨)
    """
    if not text:
        return []
    n = len(text)
    memo: dict[int, list[tuple[str, int, str]] | None] = {}

    def cover(i: int) -> list[tuple[str, int, str]] | None:
        if i == n:
            return []
        if i in memo:
            return memo[i]
        for name, row_no, abbr in word_lookup:
            if text.startswith(name, i):
                rest = cover(i + len(name))
                if rest is not None:
                    memo[i] = [(name, row_no, abbr), *rest]
                    return memo[i]
        memo[i] = None
        return None

    full = cover(0)
    if full is not None:
        return full

    # 완전 분할 불가 시: 기존처럼 최장일치 + 미매칭 문자 건너뛰기
    matches: list[tuple[str, int, str]] = []
    i = 0
    while i < n:
        found = None
        for name, row_no, abbr in word_lookup:
            if text.startswith(name, i):
                found = (name, row_no, abbr)
                break
        if found:
            matches.append(found)
            i += len(found[0])
        else:
            i += 1
    return matches


def match_words(
    design_df: pd.DataFrame, word_lookup: list[tuple[str, int, str]]
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """한글 최장일치 후 영문약어 시퀀스 비교 → 매칭/확인필요/미매칭."""
    match_rows: list[dict] = []
    review_rows: list[dict] = []
    unmatched_rows: list[dict] = []
    for _, row in design_df.iterrows():
        kor_col = row["한글 컬럼명"]
        eng_col = row["영문 컬럼명"]
        base = {
            "설계서No": row["No"],
            "한글테이블명": row["한글 테이블명"],
            "영문테이블명": row["영문 테이블명"],
            "한글컬럼명": kor_col,
            "영문컬럼명": eng_col,
        }
        segments = longest_match_segment(kor_col, word_lookup)
        if not segments:
            unmatched_rows.append(base)
            continue
        abbrs = [abbr for _, _, abbr in segments]
        recommended = recommended_eng_name(abbrs)
        eng_ok = eng_abbr_sequence_matches(eng_col, abbrs)
        reason = "" if eng_ok else "영문약어불일치"
        target = match_rows if eng_ok else review_rows
        for order, (name, row_no, abbr) in enumerate(segments, start=1):
            target.append(
                {
                    **base,
                    "표준단어행번호": row_no,
                    "매칭표준단어명": name,
                    "표준단어영문약어명": abbr,
                    "매칭순서": order,
                    "권장영문명": recommended,
                    "영문일치": "Y" if eng_ok else "N",
                    "사유": reason,
                }
            )
    return pd.DataFrame(match_rows), pd.DataFrame(review_rows), pd.DataFrame(unmatched_rows)


def match_terms_with_words(
    design_df: pd.DataFrame,
    terms_df: pd.DataFrame,
    word_lookup: list[tuple[str, int, str]],
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """표준용어 완전일치 우선, 없으면 표준단어 최장일치 + 영문약어 비교."""
    abbr_col = "공통표준용어영문약어명"
    term_lookup: dict[str, tuple[int, str]] = {}
    for _, r in terms_df.iterrows():
        name = r["공통표준용어명"]
        if not name or name == "nan" or name in term_lookup:
            continue
        abbr = r[abbr_col] if abbr_col in r and pd.notna(r[abbr_col]) else ""
        term_lookup[name] = (int(r["표준용어행번호"]), str(abbr))

    match_rows: list[dict] = []
    review_rows: list[dict] = []
    unmatched_rows: list[dict] = []
    for _, row in design_df.iterrows():
        kor_col = row["한글 컬럼명"]
        eng_col = row["영문 컬럼명"]
        base = {
            "설계서No": row["No"],
            "한글테이블명": row["한글 테이블명"],
            "영문테이블명": row["영문 테이블명"],
            "한글컬럼명": kor_col,
            "영문컬럼명": eng_col,
        }
        term_hit = term_lookup.get(kor_col)
        if term_hit:
            row_no, abbr = term_hit
            abbrs = [abbr]
            recommended = recommended_eng_name(abbrs)
            eng_ok = eng_abbr_sequence_matches(eng_col, abbrs)
            target = match_rows if eng_ok else review_rows
            target.append(
                {
                    **base,
                    "출처": "표준용어",
                    "표준행번호": row_no,
                    "매칭표준명": kor_col,
                    "표준영문약어명": abbr,
                    "매칭순서": 1,
                    "권장영문명": recommended,
                    "영문일치": "Y" if eng_ok else "N",
                    "사유": "" if eng_ok else "영문약어불일치",
                }
            )
            continue

        segments = longest_match_segment(kor_col, word_lookup)
        if segments:
            abbrs = [a for _, _, a in segments]
            recommended = recommended_eng_name(abbrs)
            eng_ok = eng_abbr_sequence_matches(eng_col, abbrs)
            target = match_rows if eng_ok else review_rows
            for order, (name, row_no, abbr) in enumerate(segments, start=1):
                target.append(
                    {
                        **base,
                        "출처": "표준단어",
                        "표준행번호": row_no,
                        "매칭표준명": name,
                        "표준영문약어명": abbr,
                        "매칭순서": order,
                        "권장영문명": recommended,
                        "영문일치": "Y" if eng_ok else "N",
                        "사유": "" if eng_ok else "영문약어불일치",
                    }
                )
            continue

        unmatched_rows.append(base)

    return pd.DataFrame(match_rows), pd.DataFrame(review_rows), pd.DataFrame(unmatched_rows)


def _records(df: pd.DataFrame, cols: list[str]) -> list[dict]:
    if df.empty:
        return []
    use_cols = [c for c in cols if c in df.columns]
    out: list[dict] = []
    for row in df[use_cols].to_dict(orient="records"):
        cleaned = {}
        for k in cols:
            v = row.get(k, "")
            if k not in row or pd.isna(v):
                cleaned[k] = ""
            elif hasattr(v, "item"):
                try:
                    cleaned[k] = v.item()
                except Exception:
                    cleaned[k] = v
            else:
                cleaned[k] = v
        out.append(cleaned)
    return out


def build_tri_payload(
    match_df: pd.DataFrame,
    review_df: pd.DataFrame,
    unmatched_df: pd.DataFrame,
    total_cols: int,
    match_cols: list[str],
) -> dict:
    matched_cols = (
        set(match_df["설계서No"].unique()) if not match_df.empty else set()
    )
    review_cols = (
        set(review_df["설계서No"].unique()) if not review_df.empty else set()
    )
    return {
        "stats": {
            "total_cols": int(total_cols),
            "matched_cols": int(len(matched_cols)),
            "review_cols": int(len(review_cols)),
            "unmatched_cols": int(len(unmatched_df)),
            "match_rows": int(len(match_df)),
            "review_rows": int(len(review_df)),
        },
        "match": _records(match_df, match_cols),
        "review": _records(review_df, match_cols),
        "unmatch": _records(unmatched_df, UNMATCH_COLS),
    }


def save_excel_tri(
    match_df: pd.DataFrame,
    review_df: pd.DataFrame,
    unmatched_df: pd.DataFrame,
    path: Path,
    match_cols: list[str],
) -> None:
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        (match_df if not match_df.empty else pd.DataFrame(columns=match_cols)).to_excel(
            writer, sheet_name="매칭", index=False
        )
        (review_df if not review_df.empty else pd.DataFrame(columns=match_cols)).to_excel(
            writer, sheet_name="확인필요", index=False
        )
        (
            unmatched_df
            if not unmatched_df.empty
            else pd.DataFrame(columns=UNMATCH_COLS)
        ).to_excel(writer, sheet_name="미매칭", index=False)


def run_word_match(
    design_path: Path, words_path: Path
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    design_df = load_design(design_path)
    words_df = load_standard_words(words_path)
    match_df, review_df, unmatched_df = match_words(
        design_df, build_word_lookup(words_df)
    )
    payload = build_tri_payload(
        match_df, review_df, unmatched_df, len(design_df), WORD_MATCH_COLS
    )
    return match_df, review_df, unmatched_df, payload


def run_term_match(
    design_path: Path, terms_path: Path, words_path: Path
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    design_df = load_design(design_path)
    terms_df = load_standard_terms(terms_path)
    words_df = load_standard_words(words_path)
    match_df, review_df, unmatched_df = match_terms_with_words(
        design_df, terms_df, build_word_lookup(words_df)
    )
    payload = build_tri_payload(
        match_df, review_df, unmatched_df, len(design_df), TERM_MATCH_COLS
    )
    if match_df.empty and review_df.empty:
        payload["stats"]["from_term_cols"] = 0
        payload["stats"]["from_word_cols"] = 0
    else:
        both = pd.concat(
            [df for df in (match_df, review_df) if not df.empty], ignore_index=True
        )
        by_col = both.groupby("설계서No")["출처"].first()
        payload["stats"]["from_term_cols"] = int((by_col == "표준용어").sum())
        payload["stats"]["from_word_cols"] = int((by_col == "표준단어").sum())
    return match_df, review_df, unmatched_df, payload


def _concat_hit_frames(
    match_df: pd.DataFrame, review_df: pd.DataFrame
) -> pd.DataFrame:
    frames = [df for df in (match_df, review_df) if df is not None and not df.empty]
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def build_used_word_dictionary(
    match_df: pd.DataFrame,
    review_df: pd.DataFrame,
    words_df: pd.DataFrame,
    *,
    name_col: str = "매칭표준단어명",
    source_filter: str | None = None,
) -> pd.DataFrame:
    """점검 결과에서 사용된 표준단어만 추출(원본 CSV 컬럼 + 사용횟수)."""
    used = _concat_hit_frames(match_df, review_df)
    if used.empty or name_col not in used.columns:
        return pd.DataFrame()
    if source_filter and "출처" in used.columns:
        used = used[used["출처"] == source_filter]
    if used.empty:
        return pd.DataFrame()

    names = used[name_col].dropna().astype(str).str.strip()
    names = names[names != ""]
    if names.empty:
        return pd.DataFrame()
    counts = names.value_counts()
    col_map = (
        used.assign(_n=used[name_col].astype(str).str.strip())
        .groupby("_n")["한글컬럼명"]
        .apply(lambda s: ", ".join(sorted({str(x) for x in s if str(x).strip()})))
    )
    out = words_df[words_df["공통표준단어명"].isin(counts.index)].copy()
    if out.empty:
        return pd.DataFrame()
    out["사용횟수"] = out["공통표준단어명"].map(counts).fillna(0).astype(int)
    out["사용한글컬럼"] = out["공통표준단어명"].map(col_map).fillna("")
    if "표준단어행번호" in out.columns:
        out = out.drop(columns=["표준단어행번호"])
    return out.sort_values(["사용횟수", "공통표준단어명"], ascending=[False, True])


def build_used_term_dictionary(
    match_df: pd.DataFrame,
    review_df: pd.DataFrame,
    terms_df: pd.DataFrame,
) -> pd.DataFrame:
    """점검 결과에서 출처=표준용어인 항목만 추출."""
    used = _concat_hit_frames(match_df, review_df)
    if used.empty or "매칭표준명" not in used.columns:
        return pd.DataFrame()
    if "출처" in used.columns:
        used = used[used["출처"] == "표준용어"]
    if used.empty:
        return pd.DataFrame()

    names = used["매칭표준명"].dropna().astype(str).str.strip()
    names = names[names != ""]
    if names.empty:
        return pd.DataFrame()
    counts = names.value_counts()
    col_map = (
        used.assign(_n=used["매칭표준명"].astype(str).str.strip())
        .groupby("_n")["한글컬럼명"]
        .apply(lambda s: ", ".join(sorted({str(x) for x in s if str(x).strip()})))
    )
    out = terms_df[terms_df["공통표준용어명"].isin(counts.index)].copy()
    if out.empty:
        return pd.DataFrame()
    out["사용횟수"] = out["공통표준용어명"].map(counts).fillna(0).astype(int)
    out["사용한글컬럼"] = out["공통표준용어명"].map(col_map).fillna("")
    if "표준용어행번호" in out.columns:
        out = out.drop(columns=["표준용어행번호"])
    return out.sort_values(["사용횟수", "공통표준용어명"], ascending=[False, True])


def dictionary_template_columns(std_df: pd.DataFrame, drop_cols: list[str]) -> list[str]:
    cols = [c for c in std_df.columns if c not in drop_cols]
    for extra in ("사용횟수", "사용한글컬럼"):
        if extra not in cols:
            cols.append(extra)
    return cols


def candidate_sheet_columns(std_df: pd.DataFrame, *, kind: str) -> list[str]:
    """미등록후보: 공통표준→사용 컬럼명, 금칙어/이음동의어 목록까지만 유지."""
    drop = {"표준단어행번호", "표준용어행번호"}
    cols = [c for c in std_df.columns if c not in drop]
    stop = "금칙어 목록" if kind == "word" else "용어 이음동의어 목록"
    if stop in cols:
        cols = cols[: cols.index(stop) + 1]
    return [c.replace("공통표준", "사용") for c in cols]


def build_unregistered_candidates(
    unmatched_df: pd.DataFrame, template_cols: list[str]
) -> pd.DataFrame:
    """미매칭 컬럼 → 미등록후보 형식. 명(첫 컬럼)만 한글컬럼명, 나머지 내용은 비움."""
    if unmatched_df is None or unmatched_df.empty:
        return pd.DataFrame(columns=template_cols)
    name_col = template_cols[0] if template_cols else None
    rows: list[dict] = []
    for kor, _g in unmatched_df.groupby("한글컬럼명", dropna=False):
        row = {c: "" for c in template_cols}
        if name_col:
            row[name_col] = "" if pd.isna(kor) else str(kor).strip()
        rows.append(row)
    return pd.DataFrame(rows, columns=template_cols)


def save_word_dictionary_excel(
    used_words_df: pd.DataFrame,
    candidates_df: pd.DataFrame,
    path: Path,
    used_cols: list[str],
    candidate_cols: list[str],
) -> None:
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        (
            used_words_df
            if not used_words_df.empty
            else pd.DataFrame(columns=used_cols)
        ).to_excel(writer, sheet_name="사용표준단어", index=False)
        (
            candidates_df
            if not candidates_df.empty
            else pd.DataFrame(columns=candidate_cols)
        ).to_excel(writer, sheet_name="미등록후보", index=False)


def save_term_dictionary_excel(
    used_terms_df: pd.DataFrame,
    used_words_df: pd.DataFrame,
    candidates_df: pd.DataFrame,
    path: Path,
    term_cols: list[str],
    word_cols: list[str],
    candidate_cols: list[str],
) -> None:
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        (
            used_terms_df
            if not used_terms_df.empty
            else pd.DataFrame(columns=term_cols)
        ).to_excel(writer, sheet_name="사용표준용어", index=False)
        (
            used_words_df
            if not used_words_df.empty
            else pd.DataFrame(columns=word_cols)
        ).to_excel(writer, sheet_name="사용표준단어", index=False)
        (
            candidates_df
            if not candidates_df.empty
            else pd.DataFrame(columns=candidate_cols)
        ).to_excel(writer, sheet_name="미등록후보", index=False)


def build_word_dictionary_file(
    match_df: pd.DataFrame,
    review_df: pd.DataFrame,
    unmatched_df: pd.DataFrame,
    words_path: Path,
    out_path: Path,
) -> Path:
    words_df = load_standard_words(words_path)
    used_cols = dictionary_template_columns(words_df, ["표준단어행번호"])
    cand_cols = candidate_sheet_columns(words_df, kind="word")
    used = build_used_word_dictionary(match_df, review_df, words_df)
    if not used.empty:
        used = used.reindex(columns=used_cols)
    cand = build_unregistered_candidates(unmatched_df, cand_cols)
    save_word_dictionary_excel(used, cand, out_path, used_cols, cand_cols)
    return out_path


def build_term_dictionary_file(
    match_df: pd.DataFrame,
    review_df: pd.DataFrame,
    unmatched_df: pd.DataFrame,
    terms_path: Path,
    words_path: Path,
    out_path: Path,
) -> Path:
    terms_df = load_standard_terms(terms_path)
    words_df = load_standard_words(words_path)
    term_cols = dictionary_template_columns(terms_df, ["표준용어행번호"])
    word_cols = dictionary_template_columns(words_df, ["표준단어행번호"])
    cand_cols = candidate_sheet_columns(terms_df, kind="term")
    used_terms = build_used_term_dictionary(match_df, review_df, terms_df)
    if not used_terms.empty:
        used_terms = used_terms.reindex(columns=term_cols)
    used_words = build_used_word_dictionary(
        match_df,
        review_df,
        words_df,
        name_col="매칭표준명",
        source_filter="표준단어",
    )
    if not used_words.empty:
        used_words = used_words.reindex(columns=word_cols)
    cand = build_unregistered_candidates(unmatched_df, cand_cols)
    save_term_dictionary_excel(
        used_terms, used_words, cand, out_path, term_cols, word_cols, cand_cols
    )
    return out_path


def normalize_code_name(name: str) -> str:
    s = str(name or "").strip().replace("\n", "")
    s = re.sub(r"\s+", "", s)
    s = s.replace("_", "")
    return s


def standard_code_name_from_file(path: Path) -> str:
    name = path.stem
    for suf in (" 조회자료", " 전체자료", "_전체자료", " 전체"):
        if name.endswith(suf):
            name = name[: -len(suf)]
    name = re.sub(r"\([^)]*\)\s*$", "", name).strip()
    return name


def normalize_code_value(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    s = str(value).strip()
    if re.fullmatch(r"\d+\.0", s):
        return s[:-2]
    return s


def normalize_code_meaning(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return re.sub(r"\s+", "", str(value).strip())


def load_code_design(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name="코드정의서", header=5)
    df.columns = [str(c).replace("\n", "").strip() for c in df.columns]
    required = ["코드명(한글)", "코드값"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"코드정의서에 필요한 컬럼이 없습니다: {missing}")
    df = df.dropna(subset=["코드명(한글)"]).copy()
    df["코드명(한글)"] = df["코드명(한글)"].astype(str).str.strip()
    if "코드명(영문)" in df.columns:
        df["코드명(영문)"] = df["코드명(영문)"].fillna("").astype(str).str.strip()
    else:
        df["코드명(영문)"] = ""
    df["코드값"] = df["코드값"].map(normalize_code_value)
    if "코드값의미" in df.columns:
        df["코드값의미"] = df["코드값의미"].fillna("").astype(str).str.strip()
    else:
        df["코드값의미"] = ""
    if "비고" in df.columns:
        df["비고"] = df["비고"].fillna("").astype(str).str.strip()
    else:
        df["비고"] = ""
    return df


def _read_standard_code_file(path: Path) -> pd.DataFrame | None:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            df = pd.read_excel(path, header=0)
        except Exception:
            return None
    df.columns = [str(c).replace("\n", "").strip() for c in df.columns]
    if "코드값" not in df.columns:
        return None
    out = pd.DataFrame(
        {
            "코드값": df["코드값"].map(normalize_code_value),
            "코드값의미": (
                df["코드값의미"].fillna("").astype(str).str.strip()
                if "코드값의미" in df.columns
                else ""
            ),
        }
    )
    out = out[out["코드값"] != ""].drop_duplicates(subset=["코드값"], keep="first")
    return out


def build_standard_code_index(code_dir: Path) -> dict[str, dict]:
    """표준코드 엑셀 인덱스. key=정규화코드명."""
    if not code_dir.exists():
        raise FileNotFoundError(f"표준코드 폴더 없음: {code_dir}")
    xlsx_files = sorted(code_dir.glob("*.xlsx"))
    cache_path = code_dir / ".std_code_index.pkl"
    stamp = tuple((p.name, p.stat().st_mtime_ns, p.stat().st_size) for p in xlsx_files)
    if cache_path.exists():
        try:
            cached = pickle.loads(cache_path.read_bytes())
            # Prefer cache when stamp matches, or when xlsx dumps are not bundled (cloud).
            if cached.get("stamp") == stamp or not xlsx_files:
                return cached["index"]
        except Exception:
            pass

    if not xlsx_files:
        raise FileNotFoundError(
            f"표준코드 엑셀/인덱스 없음: {code_dir} "
            "(*.xlsx 또는 .std_code_index.pkl 필요)"
        )

    index: dict[str, dict] = {}
    for path in xlsx_files:
        std_name = standard_code_name_from_file(path)
        key = normalize_code_name(std_name)
        if not key:
            continue
        df = _read_standard_code_file(path)
        if df is None or df.empty:
            continue
        values = {
            str(r["코드값"]): str(r["코드값의미"])
            for _, r in df.iterrows()
            if str(r["코드값"])
        }
        # 동일 정규화명이 여러 파일이면 값이 많은 쪽 유지
        prev = index.get(key)
        if prev and len(prev["values"]) >= len(values):
            continue
        index[key] = {
            "name": std_name,
            "file": path.name,
            "values": values,
        }
    try:
        cache_path.write_bytes(pickle.dumps({"stamp": stamp, "index": index}))
    except Exception:
        pass
    return index


def resolve_standard_code(
    design_name: str, std_index: dict[str, dict]
) -> tuple[dict | None, str]:
    """설계 코드명 → 표준코드 항목. (item, 코드명매칭종류)"""
    n = normalize_code_name(design_name)
    if not n:
        return None, "코드명없음"
    n_no = n[:-2] if n.endswith("코드") else n
    for cand, kind in (
        (n, "완전일치"),
        (n_no, "접미사제외일치"),
        (n + "코드", "접미사추가일치"),
        (n_no + "코드", "접미사추가일치"),
    ):
        if cand and cand in std_index:
            return std_index[cand], kind

    # 부분일치: 긴 이름 우선
    partial: list[tuple[int, str]] = []
    for key in std_index:
        if len(key) < 2:
            continue
        if key in n or n in key or (n_no and (key in n_no or n_no in key)):
            partial.append((len(key), key))
    if partial:
        partial.sort(reverse=True)
        key = partial[0][1]
        return std_index[key], "부분일치"
    return None, "미매칭"


def check_standard_codes(
    design_df: pd.DataFrame, std_index: dict[str, dict]
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    match_rows: list[dict] = []
    review_rows: list[dict] = []
    unmatched_rows: list[dict] = []

    for _, row in design_df.iterrows():
        kor = str(row["코드명(한글)"])
        eng = str(row.get("코드명(영문)", "") or "")
        val = normalize_code_value(row.get("코드값", ""))
        meaning = str(row.get("코드값의미", "") or "").strip()
        remark = str(row.get("비고", "") or "").strip()
        base = {
            "코드명한글": kor,
            "코드명영문": eng,
            "설계코드값": val,
            "설계코드값의미": meaning,
            "설계비고": remark,
        }
        std_item, name_kind = resolve_standard_code(kor, std_index)
        if not std_item:
            unmatched_rows.append(
                {
                    **base,
                    "표준코드명": "",
                    "표준파일명": "",
                    "표준코드값": "",
                    "표준코드값의미": "",
                    "코드명매칭": name_kind,
                    "판정": "미매칭",
                    "사유": "표준코드명 미매칭",
                }
            )
            continue

        std_val_map = std_item["values"]
        std_meaning = std_val_map.get(val, "")
        reasons: list[str] = []
        if name_kind == "부분일치":
            reasons.append("코드명부분일치")
        if val not in std_val_map:
            reasons.append("코드값없음")
            # 의미로 역검색
            meaning_hits = [
                k
                for k, m in std_val_map.items()
                if normalize_code_meaning(m) == normalize_code_meaning(meaning)
                and meaning
            ]
            if meaning_hits:
                reasons.append("의미만일치")
                std_meaning = std_val_map[meaning_hits[0]]
                std_val_show = meaning_hits[0]
            else:
                std_val_show = ""
                std_meaning = ""
        else:
            std_val_show = val
            if meaning and normalize_code_meaning(meaning) != normalize_code_meaning(
                std_meaning
            ):
                reasons.append("의미불일치")

        result = {
            **base,
            "표준코드명": std_item["name"],
            "표준파일명": std_item["file"],
            "표준코드값": std_val_show,
            "표준코드값의미": std_meaning,
            "코드명매칭": name_kind,
            "판정": "매칭" if not reasons else "확인필요",
            "사유": ",".join(reasons),
        }
        if reasons:
            review_rows.append(result)
        else:
            match_rows.append(result)

    return (
        pd.DataFrame(match_rows),
        pd.DataFrame(review_rows),
        pd.DataFrame(unmatched_rows),
    )


def save_code_excel(
    match_df: pd.DataFrame,
    review_df: pd.DataFrame,
    unmatched_df: pd.DataFrame,
    path: Path,
) -> None:
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        (
            match_df if not match_df.empty else pd.DataFrame(columns=CODE_RESULT_COLS)
        ).to_excel(writer, sheet_name="매칭", index=False)
        (
            review_df if not review_df.empty else pd.DataFrame(columns=CODE_RESULT_COLS)
        ).to_excel(writer, sheet_name="확인필요", index=False)
        (
            unmatched_df
            if not unmatched_df.empty
            else pd.DataFrame(columns=CODE_RESULT_COLS)
        ).to_excel(writer, sheet_name="미매칭", index=False)


def run_code_check(
    design_path: Path, code_dir: Path
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    design_df = load_code_design(design_path)
    std_index = build_standard_code_index(code_dir)
    match_df, review_df, unmatched_df = check_standard_codes(design_df, std_index)
    matched_names = (
        set(match_df["코드명한글"].unique()) if not match_df.empty else set()
    )
    review_names = (
        set(review_df["코드명한글"].unique()) if not review_df.empty else set()
    )
    unmatched_names = (
        set(unmatched_df["코드명한글"].unique()) if not unmatched_df.empty else set()
    )
    payload = {
        "stats": {
            "total_cols": int(design_df["코드명(한글)"].nunique()),
            "total_rows": int(len(design_df)),
            "matched_cols": int(len(matched_names)),
            "review_cols": int(len(review_names - matched_names)),
            "unmatched_cols": int(
                len(unmatched_names - matched_names - review_names)
            ),
            "match_rows": int(len(match_df)),
            "review_rows": int(len(review_df)),
            "std_files": int(len(std_index)),
        },
        "match": _records(match_df, CODE_RESULT_COLS),
        "review": _records(review_df, CODE_RESULT_COLS),
        "unmatch": _records(unmatched_df, CODE_RESULT_COLS),
    }
    return match_df, review_df, unmatched_df, payload


APP_HTML = r"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DB표준 점검</title>
<style>
  :root {
    --bg:#f4f6f8; --panel:#fff; --text:#1a1f26; --muted:#5b6570;
    --line:#d8dee6; --accent:#0b5fff; --ok:#0f7b4c; --warn:#9a6700; --danger:#b42318;
  }
  * { box-sizing:border-box; }
  body { margin:0; font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif; background:var(--bg); color:var(--text); }
  header { background:var(--panel); border-bottom:1px solid var(--line); padding:18px 24px; }
  h1 { margin:0 0 6px; font-size:22px; }
  .sub { color:var(--muted); font-size:13px; }
  main { padding:16px 24px 40px; max-width:1400px; margin:0 auto; }
  .main-tabs { display:flex; gap:8px; margin-bottom:14px; }
  .main-tab {
    border:1px solid var(--line); background:#f8fafc; border-radius:8px;
    padding:10px 16px; cursor:pointer; font:inherit;
  }
  .main-tab.active { background:var(--accent); border-color:var(--accent); color:#fff; }
  .pane { display:none; }
  .pane.active { display:block; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:14px; }
  .card h2 { margin:0 0 10px; font-size:16px; }
  .fields { display:grid; gap:12px; }
  .field label { display:block; font-size:13px; margin-bottom:6px; color:var(--muted); }
  .field input[type="file"] {
    width:100%; border:1px solid var(--line); border-radius:8px; padding:10px; background:#f8fafc;
  }
  .hint { margin-top:6px; font-size:12px; color:var(--muted); }
  .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; align-items:center; }
  button, .btn {
    border:1px solid var(--line); background:#f8fafc; color:var(--text);
    border-radius:8px; padding:9px 14px; cursor:pointer; font:inherit; text-decoration:none; display:inline-block;
  }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  button:disabled { opacity:.55; cursor:not-allowed; }
  .msg { font-size:13px; color:var(--muted); }
  .msg.err { color:var(--danger); }
  .msg.ok { color:var(--ok); }
  .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:14px; }
  .stat { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
  .stat .v { font-size:28px; font-weight:700; line-height:1.1; }
  .stat .l { margin-top:4px; color:var(--muted); font-size:13px; }
  .stat.ok .v { color:var(--ok); }
  .stat.warn .v { color:var(--warn); }
  .toolbar {
    display:flex; gap:10px; flex-wrap:wrap; align-items:center;
    background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px; margin-bottom:14px;
  }
  .tabs { display:flex; gap:6px; }
  .tab.active { background:var(--accent); border-color:var(--accent); color:#fff; }
  input[type="search"] {
    flex:1; min-width:220px; border:1px solid var(--line); border-radius:8px; padding:9px 12px; font:inherit;
  }
  .count { color:var(--muted); font-size:13px; }
  .panel {
    background:var(--panel); border:1px solid var(--line); border-radius:10px;
    overflow:auto; max-height:calc(100vh - 460px);
  }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { padding:9px 10px; border-bottom:1px solid var(--line); text-align:left; white-space:nowrap; }
  th { position:sticky; top:0; background:#eef2f7; z-index:1; }
  th.group { top:0; z-index:2; text-align:center; font-size:12px; letter-spacing:0.02em; }
  th.group.design, td.design-side { background:#eef2f7; }
  th.group.std { background:#e8eef9; color:#1e3a5f; }
  th.sep, td.sep {
    border-right: 3px solid #64748b;
  }
  tr:nth-child(even) td { background:#fafbfc; }
  tr:nth-child(even) td.sep { background:#fafbfc; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  thead tr:first-child th { border-bottom:1px solid #c5ced9; }
  thead tr:nth-child(2) th { top:28px; }
  .empty { padding:28px; color:var(--muted); }
  .results { display:none; }
  .results.show { display:block; }
  @media (max-width:900px){ .stats{ grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
</head>
<body>
<header>
  <h1>DB표준 점검</h1>
  <div class="sub">테이블정의서 × 행안부 공통표준단어/용어/도메인 · 코드정의서 × 행정표준코드</div>
</header>
<main>
  <div class="main-tabs">
    <button class="main-tab active" data-kind="word" type="button">표준단어점검</button>
    <button class="main-tab" data-kind="term" type="button">표준용어점검</button>
    <button class="main-tab" data-kind="domain" type="button">표준도메인점검</button>
    <button class="main-tab" data-kind="code" type="button">표준코드점검</button>
  </div>

  <section class="pane active" id="pane-word">
    <div class="card">
      <h2>표준단어점검</h2>
      <div class="hint" style="margin-bottom:12px">
        기본: <strong>__DEFAULT_WORDS_NAME__</strong> + <strong>__DEFAULT_DESIGN_NAME__</strong> · 최장일치<br/>
        한글 매칭 후 영문약어 시퀀스까지 일치하면 매칭, 영문만 다르면 확인필요, 한글 미매칭은 미매칭.
      </div>
      <div class="fields">
        <div class="field">
          <label>공통표준단어 (CSV) · 선택</label>
          <input id="wordStdFile" type="file" accept=".csv,text/csv" />
        </div>
        <div class="field">
          <label>테이블정의서 (Excel) · 선택</label>
          <input id="wordDesignFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </div>
      </div>
      <div class="actions">
        <button class="primary" id="wordRunBtn" type="button">점검 실행</button>
        <a class="btn" id="wordDl" href="/download/word" hidden>점검결과 Excel</a>
        <button class="btn" id="wordDictBtn" type="button" hidden>단어집 다운로드</button>
        <span class="msg" id="wordStatus"></span>
      </div>
      <div class="hint" style="margin-top:8px">단어집: 사용표준단어 + 미등록후보(공통표준→사용 컬럼명, 금칙어 목록까지만, 내용은 비움).</div>
    </div>
    <div class="results" id="wordResults">
      <div class="stats" id="wordStats"></div>
      <div class="toolbar">
        <div class="tabs">
          <button class="tab active" data-target="word" data-view="match" type="button">매칭</button>
          <button class="tab" data-target="word" data-view="review" type="button">확인필요</button>
          <button class="tab" data-target="word" data-view="unmatch" type="button">미매칭</button>
        </div>
        <input id="wordQ" type="search" placeholder="검색" />
        <span class="count" id="wordCount"></span>
      </div>
      <div class="panel">
        <table><thead id="wordThead"></thead><tbody id="wordTbody"></tbody></table>
        <div class="empty" id="wordEmpty" hidden>검색 결과가 없습니다.</div>
      </div>
    </div>
  </section>

  <section class="pane" id="pane-term">
    <div class="card">
      <h2>표준용어점검</h2>
      <div class="hint" style="margin-bottom:12px">
        기본: <strong>__DEFAULT_TERMS_NAME__</strong> + <strong>__DEFAULT_WORDS_NAME__</strong> + <strong>__DEFAULT_DESIGN_NAME__</strong><br/>
        우선 표준용어(완전일치) → 없으면 표준단어(최장일치). 영문약어까지 일치하면 매칭, 영문만 다르면 확인필요, 둘 다 없으면 미매칭.
      </div>
      <div class="fields">
        <div class="field">
          <label>공통표준용어 (CSV) · 선택</label>
          <input id="termStdFile" type="file" accept=".csv,text/csv" />
        </div>
        <div class="field">
          <label>공통표준단어 (CSV) · 선택</label>
          <input id="termWordsFile" type="file" accept=".csv,text/csv" />
        </div>
        <div class="field">
          <label>테이블정의서 (Excel) · 선택</label>
          <input id="termDesignFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </div>
      </div>
      <div class="actions">
        <button class="primary" id="termRunBtn" type="button">점검 실행</button>
        <a class="btn" id="termDl" href="/download/term" hidden>점검결과 Excel</a>
        <button class="btn" id="termDictBtn" type="button" hidden>용어집 다운로드</button>
        <span class="msg" id="termStatus"></span>
      </div>
      <div class="hint" style="margin-top:8px">용어집: 사용표준용어·사용표준단어 + 미등록후보(공통표준→사용 컬럼명, 이음동의어 목록까지만, 내용은 비움).</div>
    </div>
    <div class="results" id="termResults">
      <div class="stats" id="termStats"></div>
      <div class="toolbar">
        <div class="tabs">
          <button class="tab active" data-target="term" data-view="match" type="button">매칭</button>
          <button class="tab" data-target="term" data-view="review" type="button">확인필요</button>
          <button class="tab" data-target="term" data-view="unmatch" type="button">미매칭</button>
        </div>
        <input id="termQ" type="search" placeholder="검색" />
        <span class="count" id="termCount"></span>
      </div>
      <div class="panel">
        <table><thead id="termThead"></thead><tbody id="termTbody"></tbody></table>
        <div class="empty" id="termEmpty" hidden>검색 결과가 없습니다.</div>
      </div>
    </div>
  </section>

  <section class="pane" id="pane-domain">
    <div class="card">
      <h2>표준도메인점검</h2>
      <div class="hint" style="margin-bottom:12px">
        기본: <strong>__DEFAULT_DOMAINS_NAME__</strong> + <strong>__DEFAULT_TERMS_NAME__</strong> + <strong>__DEFAULT_DESIGN_NAME__</strong><br/>
        표준용어 완전일치 후 영문약어·타입·길이 점검. 모두 적합하면 매칭, 불일치가 있으면 확인필요, 용어 없으면 미매칭.
      </div>
      <div class="fields">
        <div class="field">
          <label>공통표준도메인 (CSV) · 선택</label>
          <input id="domainStdFile" type="file" accept=".csv,text/csv" />
        </div>
        <div class="field">
          <label>공통표준용어 (CSV) · 선택</label>
          <input id="domainTermsFile" type="file" accept=".csv,text/csv" />
        </div>
        <div class="field">
          <label>테이블정의서 (Excel) · 선택</label>
          <input id="domainDesignFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </div>
      </div>
      <div class="actions">
        <button class="primary" id="domainRunBtn" type="button">점검 실행</button>
        <a class="btn" id="domainDl" href="/download/domain" hidden>Excel 다운로드</a>
        <span class="msg" id="domainStatus"></span>
      </div>
    </div>
    <div class="results" id="domainResults">
      <div class="stats" id="domainStats"></div>
      <div class="toolbar">
        <div class="tabs">
          <button class="tab active" data-target="domain" data-view="match" type="button">매칭</button>
          <button class="tab" data-target="domain" data-view="review" type="button">확인필요</button>
          <button class="tab" data-target="domain" data-view="unmatch" type="button">미매칭</button>
        </div>
        <input id="domainQ" type="search" placeholder="검색" />
        <span class="count" id="domainCount"></span>
      </div>
      <div class="panel">
        <table><thead id="domainThead"></thead><tbody id="domainTbody"></tbody></table>
        <div class="empty" id="domainEmpty" hidden>검색 결과가 없습니다.</div>
      </div>
    </div>
  </section>

  <section class="pane" id="pane-code">
    <div class="card">
      <h2>표준코드점검</h2>
      <div class="hint" style="margin-bottom:12px">
        기본: <strong>__DEFAULT_CODE_DESIGN_NAME__</strong> × <strong>__DEFAULT_CODE_DIR_NAME__</strong> 행정표준코드 엑셀<br/>
        코드명(한글)으로 표준코드 파일을 찾고, 코드값·코드값의미를 비교합니다. 코드명 없음=미매칭, 값/의미 불일치=확인필요.
      </div>
      <div class="fields">
        <div class="field">
          <label>코드정의서 (Excel) · 선택</label>
          <input id="codeDesignFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </div>
      </div>
      <div class="actions">
        <button class="primary" id="codeRunBtn" type="button">점검 실행</button>
        <a class="btn" id="codeDl" href="/download/code" hidden>Excel 다운로드</a>
        <span class="msg" id="codeStatus"></span>
      </div>
    </div>
    <div class="results" id="codeResults">
      <div class="stats" id="codeStats"></div>
      <div class="toolbar">
        <div class="tabs">
          <button class="tab active" data-target="code" data-view="match" type="button">매칭</button>
          <button class="tab" data-target="code" data-view="review" type="button">확인필요</button>
          <button class="tab" data-target="code" data-view="unmatch" type="button">미매칭</button>
        </div>
        <input id="codeQ" type="search" placeholder="검색" />
        <span class="count" id="codeCount"></span>
      </div>
      <div class="panel">
        <table><thead id="codeThead"></thead><tbody id="codeTbody"></tbody></table>
        <div class="empty" id="codeEmpty" hidden>검색 결과가 없습니다.</div>
      </div>
    </div>
  </section>
</main>
<script>
const MODE = "__MODE__";
const BOOT = {
  word: { data: __BOOTSTRAP_WORD__, meta: __BOOTSTRAP_WORD_META__ },
  term: { data: __BOOTSTRAP_TERM__, meta: __BOOTSTRAP_TERM_META__ },
  domain: { data: __BOOTSTRAP_DOMAIN__, meta: __BOOTSTRAP_DOMAIN_META__ },
  code: { data: __BOOTSTRAP_CODE__, meta: __BOOTSTRAP_CODE_META__ },
};
const STATE = {
  word: { data: null, view: "match" },
  term: { data: null, view: "match" },
  domain: { data: null, view: "match" },
  code: { data: null, view: "match" },
};
const HEADERS = {
  word: {
    match: ["설계서No","한글테이블명","한글컬럼명","영문컬럼명","표준단어행번호","매칭표준단어명","표준단어영문약어명","매칭순서","권장영문명","영문일치","사유"],
    review: ["설계서No","한글테이블명","한글컬럼명","영문컬럼명","표준단어행번호","매칭표준단어명","표준단어영문약어명","매칭순서","권장영문명","영문일치","사유"],
    unmatch: ["설계서No","한글테이블명","한글컬럼명","영문컬럼명"],
  },
  term: {
    match: ["설계서No","한글테이블명","한글컬럼명","영문컬럼명","출처","표준행번호","매칭표준명","표준영문약어명","매칭순서","권장영문명","영문일치","사유"],
    review: ["설계서No","한글테이블명","한글컬럼명","영문컬럼명","출처","표준행번호","매칭표준명","표준영문약어명","매칭순서","권장영문명","영문일치","사유"],
    unmatch: ["설계서No","한글테이블명","한글컬럼명","영문컬럼명"],
  },
  domain: {
    match: ["설계서No","한글테이블명","한글컬럼명","영문컬럼명","설계데이터타입","설계데이터길이","표준용어명","표준영문약어명","권장영문명","영문일치","도메인명","도메인데이터타입","도메인데이터길이","판정","사유"],
    review: ["설계서No","한글테이블명","한글컬럼명","영문컬럼명","설계데이터타입","설계데이터길이","표준용어명","표준영문약어명","권장영문명","영문일치","도메인명","도메인데이터타입","도메인데이터길이","판정","사유"],
    unmatch: ["설계서No","한글테이블명","한글컬럼명","영문컬럼명","설계데이터타입","설계데이터길이","사유"],
  },
  code: {
    match: ["코드명한글","코드명영문","설계코드값","설계코드값의미","설계비고","표준코드명","표준파일명","표준코드값","표준코드값의미","코드명매칭","판정","사유"],
    review: ["코드명한글","코드명영문","설계코드값","설계코드값의미","설계비고","표준코드명","표준파일명","표준코드값","표준코드값의미","코드명매칭","판정","사유"],
    unmatch: ["코드명한글","코드명영문","설계코드값","설계코드값의미","설계비고","표준코드명","표준파일명","표준코드값","표준코드값의미","코드명매칭","판정","사유"],
  },
};
const NUM_COLS = new Set(["설계서No","표준단어행번호","표준행번호","매칭순서","설계데이터길이","도메인데이터길이"]);
/** 설계서 영역 마지막 컬럼명 → 그 오른쪽에 구분선 */
const SPLIT_AFTER = {
  word: { match: "영문컬럼명", review: "영문컬럼명", unmatch: null },
  term: { match: "영문컬럼명", review: "영문컬럼명", unmatch: null },
  domain: { match: "설계데이터길이", review: "설계데이터길이", unmatch: "설계데이터길이" },
  code: { match: "설계비고", review: "설계비고", unmatch: "설계비고" },
};
const STD_GROUP_LABEL = {
  word: "표준단어",
  term: "표준(용어/단어)",
  domain: "표준도메인",
  code: "행정표준코드",
};
const DESIGN_GROUP_LABEL = {
  word: "테이블정의서",
  term: "테이블정의서",
  domain: "테이블정의서",
  code: "코드정의서",
};

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}
function setStatus(kind, text, cls) {
  const el = document.getElementById(kind + "Status");
  el.className = "msg" + (cls ? " " + cls : "");
  el.textContent = text || "";
}
function renderStats(kind) {
  const s = STATE[kind].data.stats;
  let cols = 5;
  let extra = "";
  let html = "";
  if (kind === "term") {
    cols = 7;
    extra = `
    <div class="stat"><div class="v">${s.from_term_cols ?? 0}</div><div class="l">출처:표준용어</div></div>
    <div class="stat"><div class="v">${s.from_word_cols ?? 0}</div><div class="l">출처:표준단어</div></div>`;
  }
  if (kind === "domain") {
    cols = 4;
    html = `
    <div class="stat"><div class="v">${s.total_cols}</div><div class="l">총 컬럼</div></div>
    <div class="stat ok"><div class="v">${s.matched_cols ?? 0}</div><div class="l">매칭</div></div>
    <div class="stat warn"><div class="v">${s.review_cols ?? 0}</div><div class="l">확인필요</div></div>
    <div class="stat"><div class="v">${s.unmatched_cols ?? 0}</div><div class="l">미매칭</div></div>`;
  } else if (kind === "code") {
    cols = 5;
    html = `
    <div class="stat"><div class="v">${s.total_cols}</div><div class="l">설계 코드종류</div></div>
    <div class="stat"><div class="v">${s.total_rows ?? 0}</div><div class="l">설계 코드값 행</div></div>
    <div class="stat ok"><div class="v">${s.matched_cols ?? 0}</div><div class="l">매칭 코드</div></div>
    <div class="stat warn"><div class="v">${s.review_cols ?? 0}</div><div class="l">확인필요 코드</div></div>
    <div class="stat"><div class="v">${s.unmatched_cols ?? 0}</div><div class="l">미매칭 코드</div></div>`;
  } else {
    html = `
    <div class="stat"><div class="v">${s.total_cols}</div><div class="l">총 컬럼</div></div>
    <div class="stat ok"><div class="v">${s.matched_cols ?? 0}</div><div class="l">매칭 컬럼</div></div>
    <div class="stat warn"><div class="v">${s.review_cols ?? 0}</div><div class="l">확인필요 컬럼</div></div>
    <div class="stat"><div class="v">${s.unmatched_cols ?? 0}</div><div class="l">미매칭 컬럼</div></div>
    <div class="stat"><div class="v">${(s.match_rows ?? 0) + (s.review_rows ?? 0)}</div><div class="l">매칭·확인 행</div></div>${extra}`;
  }
  document.getElementById(kind + "Stats").innerHTML = html;
  document.getElementById(kind + "Stats").style.gridTemplateColumns =
    `repeat(${cols}, minmax(0, 1fr))`;
}
function dataKey(kind, view) {
  return view;
}
function filteredRows(kind) {
  const q = document.getElementById(kind + "Q").value.trim().toLowerCase();
  const view = STATE[kind].view;
  const rows = STATE[kind].data[dataKey(kind, view)] || [];
  if (!q) return rows;
  return rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(q));
}
function splitIndex(kind, view, headers) {
  const after = SPLIT_AFTER[kind] && SPLIT_AFTER[kind][view];
  if (!after) return -1;
  return headers.indexOf(after);
}
function cellClass(h, isSep) {
  const parts = [];
  if (NUM_COLS.has(h)) parts.push("num");
  if (isSep) parts.push("sep");
  return parts.length ? ` class="${parts.join(" ")}"` : "";
}
function renderTable(kind) {
  if (!STATE[kind].data) return;
  const view = STATE[kind].view;
  const headers = HEADERS[kind][view];
  const rows = filteredRows(kind);
  const total = (STATE[kind].data[dataKey(kind, view)] || []).length;
  const sepAt = splitIndex(kind, view, headers);
  document.getElementById(kind + "Count").textContent = rows.length + " / " + total + "행";

  let thead = "";
  if (sepAt >= 0 && sepAt < headers.length - 1) {
    const left = sepAt + 1;
    const right = headers.length - left;
    const rightLabel = (kind === "domain" && view === "unmatch")
      ? "비고"
      : STD_GROUP_LABEL[kind];
    const leftLabel = DESIGN_GROUP_LABEL[kind] || "테이블정의서";
    thead += "<tr>" +
      `<th class="group design sep" colspan="${left}">${esc(leftLabel)}</th>` +
      `<th class="group std" colspan="${right}">${esc(rightLabel)}</th>` +
      "</tr>";
  } else if (sepAt < 0) {
    const leftLabel = DESIGN_GROUP_LABEL[kind] || "테이블정의서";
    thead += `<tr><th class="group design" colspan="${headers.length}">${esc(leftLabel)}</th></tr>`;
  }
  thead += "<tr>" + headers.map((h, i) =>
    `<th${cellClass(h, i === sepAt)}>${esc(h)}</th>`
  ).join("") + "</tr>";
  document.getElementById(kind + "Thead").innerHTML = thead;

  const tbody = document.getElementById(kind + "Tbody");
  const empty = document.getElementById(kind + "Empty");
  if (!rows.length) {
    tbody.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  tbody.innerHTML = rows.map((r) =>
    "<tr>" + headers.map((h, i) =>
      `<td${cellClass(h, i === sepAt)}>${esc(r[h])}</td>`
    ).join("") + "</tr>"
  ).join("");
}
function showResults(kind, payload, meta) {
  STATE[kind].data = payload;
  document.getElementById(kind + "Results").classList.add("show");
  if (MODE === "app") {
    document.getElementById(kind + "Dl").hidden = false;
    const dictBtn = document.getElementById(kind + "DictBtn");
    if (dictBtn) dictBtn.hidden = false;
  }
  renderStats(kind);
  renderTable(kind);
  let src = "";
  if (meta && meta.sources) {
    if (kind === "code") {
      src = ` (코드정의서: ${meta.sources.design} / 표준코드: ${meta.sources.std} · ${meta.sources.std_files ?? ""}종)`;
    } else if (kind === "domain") {
      src = ` (도메인: ${meta.sources.std} / 용어: ${meta.sources.terms} / 설계서: ${meta.sources.design})`;
    } else if (meta.sources.words) {
      src = ` (용어: ${meta.sources.std} / 단어: ${meta.sources.words} / 설계서: ${meta.sources.design})`;
    } else {
      src = ` (표준: ${meta.sources.std} / 설계서: ${meta.sources.design})`;
    }
  }
  if (meta && meta.warning) setStatus(kind, "완료 · " + meta.warning + src, "err");
  else if (meta && meta.error) setStatus(kind, "실패: " + meta.error, "err");
  else setStatus(kind, "완료" + src, "ok");
}

document.querySelectorAll(".main-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const kind = btn.dataset.kind;
    document.querySelectorAll(".main-tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.id === "pane-" + kind));
  });
});
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const kind = btn.dataset.target;
    STATE[kind].view = btn.dataset.view;
    document.querySelectorAll(`.tab[data-target="${kind}"]`).forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    renderTable(kind);
  });
});
["word","term","domain","code"].forEach((kind) => {
  document.getElementById(kind + "Q").addEventListener("input", () => renderTable(kind));
});

async function runCheck(kind) {
  const designInput = document.getElementById(kind + "DesignFile").files[0];
  const btn = document.getElementById(kind + "RunBtn");
  btn.disabled = true;
  setStatus(kind, "점검 중...");
  try {
    let res;
    let noUpload = false;
    const fd = new FormData();
    if (kind === "code") {
      noUpload = !designInput;
      if (designInput) fd.append("design", designInput);
    } else if (kind === "domain") {
      const stdInput = document.getElementById("domainStdFile").files[0];
      const termsInput = document.getElementById("domainTermsFile").files[0];
      noUpload = !stdInput && !termsInput && !designInput;
      if (stdInput) fd.append("std", stdInput);
      if (termsInput) fd.append("terms", termsInput);
      if (designInput) fd.append("design", designInput);
    } else {
      const stdInput = document.getElementById(kind + "StdFile").files[0];
      const wordsInput = kind === "term" ? document.getElementById("termWordsFile").files[0] : null;
      noUpload = !stdInput && !designInput && !wordsInput;
      if (stdInput) fd.append("std", stdInput);
      if (wordsInput) fd.append("words", wordsInput);
      if (designInput) fd.append("design", designInput);
    }
    if (noUpload) {
      res = await fetch("/api/match/" + kind, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_defaults: true }),
      });
    } else {
      res = await fetch("/api/match/" + kind, { method: "POST", body: fd });
    }
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "실행 실패");
    showResults(kind, body.data, body);
  } catch (e) {
    setStatus(kind, String(e.message || e), "err");
  } finally {
    btn.disabled = false;
  }
}
document.getElementById("wordRunBtn").addEventListener("click", () => runCheck("word"));
document.getElementById("termRunBtn").addEventListener("click", () => runCheck("term"));
document.getElementById("domainRunBtn").addEventListener("click", () => runCheck("domain"));
document.getElementById("codeRunBtn").addEventListener("click", () => runCheck("code"));

async function downloadDictionary(kind) {
  const btn = document.getElementById(kind + "DictBtn");
  const label = kind === "word" ? "단어집" : "용어집";
  btn.disabled = true;
  setStatus(kind, label + " 생성 중...");
  try {
    const res = await fetch("/api/dict/" + kind, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      let msg = "다운로드 실패";
      try {
        const body = await res.json();
        msg = body.error || msg;
      } catch (_) {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const disp = res.headers.get("Content-Disposition") || "";
    const m = /filename=\"?([^\";]+)\"?/.exec(disp);
    const fname = m ? m[1] : (kind === "word" ? "word_dictionary.xlsx" : "term_dictionary.xlsx");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(kind, label + " 다운로드 완료", "ok");
  } catch (e) {
    setStatus(kind, String(e.message || e), "err");
  } finally {
    btn.disabled = false;
  }
}
document.getElementById("wordDictBtn").addEventListener("click", () => downloadDictionary("word"));
document.getElementById("termDictBtn").addEventListener("click", () => downloadDictionary("term"));

["word","term","domain","code"].forEach((kind) => {
  const boot = BOOT[kind];
  if (boot.data && boot.data.stats) {
    showResults(kind, boot.data, boot.meta || {});
  } else if (boot.meta && boot.meta.error) {
    setStatus(kind, "기본 파일 자동 점검 실패: " + boot.meta.error, "err");
  }
});
</script>
</body>
</html>
"""


def _parse_multipart(handler: BaseHTTPRequestHandler) -> dict[str, tuple[str, bytes]]:
    ctype = handler.headers.get("Content-Type", "")
    if "multipart/form-data" not in ctype:
        raise ValueError("multipart/form-data 필요")
    boundary = None
    for part in ctype.split(";"):
        part = part.strip()
        if part.startswith("boundary="):
            boundary = part.split("=", 1)[1].strip().strip('"')
            break
    if not boundary:
        raise ValueError("boundary 없음")

    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length)
    delim = ("--" + boundary).encode("utf-8")
    files: dict[str, tuple[str, bytes]] = {}
    for part in raw.split(delim):
        if not part or part in (b"--\r\n", b"--", b"\r\n"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        if part == b"--":
            continue
        header_blob, _, body = part.partition(b"\r\n\r\n")
        if body.endswith(b"\r\n"):
            body = body[:-2]
        disposition = ""
        for h in header_blob.decode("utf-8", errors="replace").split("\r\n"):
            if h.lower().startswith("content-disposition:"):
                disposition = h
                break
        name = None
        filename = ""
        for token in disposition.split(";"):
            token = token.strip()
            if token.startswith("name="):
                name = token.split("=", 1)[1].strip().strip('"')
            elif token.startswith("filename="):
                filename = token.split("=", 1)[1].strip().strip('"')
        if name:
            files[name] = (filename, body)
    return files


def create_handler(
    *,
    word_xlsx: Path,
    term_xlsx: Path,
    domain_xlsx: Path,
    code_xlsx: Path,
    word_dict_xlsx: Path,
    term_dict_xlsx: Path,
    work_dir: Path,
    default_design: Path,
    default_words: Path,
    default_terms: Path,
    default_domains: Path,
    default_code_design: Path,
    default_code_dir: Path,
):
    run_cache: dict[str, dict | None] = {"word": None, "term": None}
    cache_word_std = work_dir / "cache_words_for_dict.csv"
    cache_term_std = work_dir / "cache_terms_for_dict.csv"
    cache_term_words = work_dir / "cache_term_words_for_dict.csv"

    def _persist_copy(src: Path, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        return dest

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:
            print("[web]", fmt % args)

        def _send(self, code: int, body: bytes, content_type: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _send_json(self, code: int, obj: dict) -> None:
            self._send(
                code,
                json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                "application/json; charset=utf-8",
            )

        def _send_xlsx(self, data: bytes, filename: str) -> None:
            self.send_response(200)
            self.send_header(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            self.send_header(
                "Content-Disposition", f'attachment; filename="{filename}"'
            )
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _safe_json(self, obj) -> str:
            return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")

        def _run_kind(
            self,
            kind: str,
            design_path: Path,
            std_path: Path,
            words_path: Path | None = None,
            terms_path: Path | None = None,
        ) -> dict:
            if kind == "word":
                match_df, review_df, unmatched_df, payload = run_word_match(
                    design_path, std_path
                )
                warning = None
                try:
                    save_excel_tri(
                        match_df, review_df, unmatched_df, word_xlsx, WORD_MATCH_COLS
                    )
                except PermissionError:
                    warning = f"Excel 저장 실패(파일이 열려 있을 수 있음): {word_xlsx.name}"
                run_cache["word"] = {
                    "match_df": match_df,
                    "review_df": review_df,
                    "unmatched_df": unmatched_df,
                    "words_path": _persist_copy(std_path, cache_word_std),
                }
                return {
                    "ok": True,
                    "data": payload,
                    "warning": warning,
                    "sources": {"std": std_path.name, "design": design_path.name},
                }
            if kind == "term":
                wpath = words_path or default_words
                match_df, review_df, unmatched_df, payload = run_term_match(
                    design_path, std_path, wpath
                )
                warning = None
                try:
                    save_excel_tri(
                        match_df, review_df, unmatched_df, term_xlsx, TERM_MATCH_COLS
                    )
                except PermissionError:
                    warning = f"Excel 저장 실패(파일이 열려 있을 수 있음): {term_xlsx.name}"
                run_cache["term"] = {
                    "match_df": match_df,
                    "review_df": review_df,
                    "unmatched_df": unmatched_df,
                    "terms_path": _persist_copy(std_path, cache_term_std),
                    "words_path": _persist_copy(wpath, cache_term_words),
                }
                return {
                    "ok": True,
                    "data": payload,
                    "warning": warning,
                    "sources": {
                        "std": std_path.name,
                        "words": wpath.name,
                        "design": design_path.name,
                    },
                }
            if kind == "code":
                match_df, review_df, unmatched_df, payload = run_code_check(
                    design_path, default_code_dir
                )
                warning = None
                try:
                    save_code_excel(match_df, review_df, unmatched_df, code_xlsx)
                except PermissionError:
                    warning = f"Excel 저장 실패(파일이 열려 있을 수 있음): {code_xlsx.name}"
                return {
                    "ok": True,
                    "data": payload,
                    "warning": warning,
                    "sources": {
                        "std": str(default_code_dir),
                        "std_files": payload["stats"].get("std_files", 0),
                        "design": design_path.name,
                    },
                }
            # domain: std_path = domains, terms_path = terms
            tpath = terms_path or default_terms
            match_df, review_df, unmatched_df, payload = run_domain_check(
                design_path, tpath, std_path
            )
            warning = None
            try:
                save_domain_excel(match_df, review_df, unmatched_df, domain_xlsx)
            except PermissionError:
                warning = f"Excel 저장 실패(파일이 열려 있을 수 있음): {domain_xlsx.name}"
            return {
                "ok": True,
                "data": payload,
                "warning": warning,
                "sources": {
                    "std": std_path.name,
                    "terms": tpath.name,
                    "design": design_path.name,
                },
            }

        def _boot_kind(self, kind: str) -> tuple[str, str]:
            try:
                if kind == "code":
                    if not default_code_design.exists():
                        raise FileNotFoundError(
                            f"기본 코드정의서 없음: {default_code_design}"
                        )
                    if not default_code_dir.exists():
                        raise FileNotFoundError(
                            f"표준코드 폴더 없음: {default_code_dir}"
                        )
                    result = self._run_kind(
                        "code", default_code_design, default_code_dir
                    )
                    return self._safe_json(result["data"]), self._safe_json(
                        {
                            "warning": result.get("warning"),
                            "sources": result.get("sources"),
                        }
                    )
                if not default_design.exists():
                    raise FileNotFoundError(f"기본 설계서 없음: {default_design}")
                if kind == "word":
                    if not default_words.exists():
                        raise FileNotFoundError(f"기본 표준단어 없음: {default_words}")
                    result = self._run_kind("word", default_design, default_words)
                elif kind == "term":
                    if not default_terms.exists():
                        raise FileNotFoundError(f"기본 표준용어 없음: {default_terms}")
                    if not default_words.exists():
                        raise FileNotFoundError(f"기본 표준단어 없음: {default_words}")
                    result = self._run_kind(
                        "term", default_design, default_terms, default_words
                    )
                else:
                    if not default_domains.exists():
                        raise FileNotFoundError(f"기본 표준도메인 없음: {default_domains}")
                    if not default_terms.exists():
                        raise FileNotFoundError(f"기본 표준용어 없음: {default_terms}")
                    result = self._run_kind(
                        "domain",
                        default_design,
                        default_domains,
                        terms_path=default_terms,
                    )
                return self._safe_json(result["data"]), self._safe_json(
                    {"warning": result.get("warning"), "sources": result.get("sources")}
                )
            except Exception as e:
                return "null", self._safe_json({"error": str(e)})

        def _page(self) -> bytes:
            word_data, word_meta = self._boot_kind("word")
            term_data, term_meta = self._boot_kind("term")
            domain_data, domain_meta = self._boot_kind("domain")
            code_data, code_meta = self._boot_kind("code")
            page = (
                APP_HTML.replace("__BOOTSTRAP_WORD__", word_data)
                .replace("__BOOTSTRAP_WORD_META__", word_meta)
                .replace("__BOOTSTRAP_TERM__", term_data)
                .replace("__BOOTSTRAP_TERM_META__", term_meta)
                .replace("__BOOTSTRAP_DOMAIN__", domain_data)
                .replace("__BOOTSTRAP_DOMAIN_META__", domain_meta)
                .replace("__BOOTSTRAP_CODE__", code_data)
                .replace("__BOOTSTRAP_CODE_META__", code_meta)
                .replace("__MODE__", "app")
                .replace("__DEFAULT_WORDS_NAME__", default_words.name)
                .replace("__DEFAULT_TERMS_NAME__", default_terms.name)
                .replace("__DEFAULT_DOMAINS_NAME__", default_domains.name)
                .replace("__DEFAULT_DESIGN_NAME__", default_design.name)
                .replace("__DEFAULT_CODE_DESIGN_NAME__", default_code_design.name)
                .replace(
                    "__DEFAULT_CODE_DIR_NAME__",
                    str(default_code_dir.relative_to(DEFAULT_DIR))
                    if default_code_dir.is_relative_to(DEFAULT_DIR)
                    else str(default_code_dir),
                )
            )
            return page.encode("utf-8")

        def do_GET(self) -> None:
            path = self.path.split("?", 1)[0]
            if path in ("/", "/index.html"):
                self._send(200, self._page(), "text/html; charset=utf-8")
                return
            downloads = {
                "/download/word": (word_xlsx, "word_match.xlsx"),
                "/download/term": (term_xlsx, "term_match.xlsx"),
                "/download/domain": (domain_xlsx, "domain_match.xlsx"),
                "/download/code": (code_xlsx, "code_match.xlsx"),
            }
            if path in downloads:
                target, fname = downloads[path]
                if not target.exists():
                    self._send_json(404, {"error": "결과 Excel이 없습니다."})
                    return
                data = target.read_bytes()
                self.send_response(200)
                self.send_header(
                    "Content-Type",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
                self.send_header(
                    "Content-Disposition", f'attachment; filename="{fname}"'
                )
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            self._send_json(404, {"error": "not found"})

        def _ensure_dict_cache(self, kind: str) -> dict:
            cached = run_cache.get(kind)
            if cached:
                return cached
            if kind == "word":
                self._run_kind("word", default_design, default_words)
            else:
                self._run_kind(
                    "term", default_design, default_terms, words_path=default_words
                )
            cached = run_cache.get(kind)
            if not cached:
                raise RuntimeError("점검 결과를 준비하지 못했습니다.")
            return cached

        def _handle_dict_api(self, kind: str) -> None:
            length = int(self.headers.get("Content-Length", "0"))
            if length:
                self.rfile.read(length)
            cached = self._ensure_dict_cache(kind)
            if kind == "word":
                build_word_dictionary_file(
                    cached["match_df"],
                    cached["review_df"],
                    cached["unmatched_df"],
                    cached["words_path"],
                    word_dict_xlsx,
                )
                self._send_xlsx(
                    word_dict_xlsx.read_bytes(), "used_word_dictionary.xlsx"
                )
                return
            build_term_dictionary_file(
                cached["match_df"],
                cached["review_df"],
                cached["unmatched_df"],
                cached["terms_path"],
                cached["words_path"],
                term_dict_xlsx,
            )
            self._send_xlsx(term_dict_xlsx.read_bytes(), "used_term_dictionary.xlsx")

        def do_POST(self) -> None:
            path = self.path.split("?", 1)[0]
            if path in ("/api/dict/word", "/api/dict/term"):
                try:
                    self._handle_dict_api(path.rsplit("/", 1)[-1])
                except Exception as e:
                    self._send_json(400, {"error": str(e)})
                return
            allowed = (
                "/api/match/word",
                "/api/match/term",
                "/api/match/domain",
                "/api/match/code",
            )
            if path not in allowed:
                self._send_json(404, {"error": "not found"})
                return
            kind = path.rsplit("/", 1)[-1]
            try:
                ctype = self.headers.get("Content-Type", "")
                design_path = (
                    default_code_design if kind == "code" else default_design
                )
                if kind == "word":
                    std_path = default_words
                elif kind == "term":
                    std_path = default_terms
                elif kind == "code":
                    std_path = default_code_dir
                else:
                    std_path = default_domains
                words_path = default_words
                terms_path = default_terms
                tmp_ctx = None

                if "application/json" in ctype:
                    length = int(self.headers.get("Content-Length", "0"))
                    if length:
                        self.rfile.read(length)
                elif "multipart/form-data" in ctype:
                    files = _parse_multipart(self)
                    std_up = files.get("std")
                    words_up = files.get("words")
                    terms_up = files.get("terms")
                    design_up = files.get("design")
                    need_tmp = bool(
                        (std_up and std_up[1])
                        or (words_up and words_up[1])
                        or (terms_up and terms_up[1])
                        or (design_up and design_up[1])
                    )
                    if need_tmp:
                        tmp_ctx = tempfile.TemporaryDirectory(dir=work_dir)
                        tmp_path = Path(tmp_ctx.name)
                        if std_up and std_up[1]:
                            std_path = tmp_path / (std_up[0] or "std.csv")
                            std_path.write_bytes(std_up[1])
                        if words_up and words_up[1]:
                            words_path = tmp_path / (words_up[0] or "words.csv")
                            words_path.write_bytes(words_up[1])
                        if terms_up and terms_up[1]:
                            terms_path = tmp_path / (terms_up[0] or "terms.csv")
                            terms_path.write_bytes(terms_up[1])
                        if design_up and design_up[1]:
                            design_path = tmp_path / (design_up[0] or "design.xlsx")
                            design_path.write_bytes(design_up[1])
                else:
                    length = int(self.headers.get("Content-Length", "0"))
                    if length:
                        self.rfile.read(length)

                if not design_path.exists():
                    label = "코드정의서" if kind == "code" else "테이블정의서"
                    raise FileNotFoundError(f"{label} 없음: {design_path}")
                if kind != "code" and not std_path.exists():
                    raise FileNotFoundError(f"표준 파일 없음: {std_path}")
                if kind == "code" and not default_code_dir.exists():
                    raise FileNotFoundError(f"표준코드 폴더 없음: {default_code_dir}")
                if kind == "term" and not words_path.exists():
                    raise FileNotFoundError(f"표준단어 파일 없음: {words_path}")
                if kind == "domain" and not terms_path.exists():
                    raise FileNotFoundError(f"표준용어 파일 없음: {terms_path}")

                try:
                    if kind == "word":
                        result = self._run_kind("word", design_path, std_path)
                    elif kind == "term":
                        result = self._run_kind(
                            "term", design_path, std_path, words_path=words_path
                        )
                    elif kind == "code":
                        result = self._run_kind("code", design_path, default_code_dir)
                    else:
                        result = self._run_kind(
                            "domain",
                            design_path,
                            std_path,
                            terms_path=terms_path,
                        )
                finally:
                    if tmp_ctx is not None:
                        tmp_ctx.cleanup()
                self._send_json(200, result)
            except Exception as e:
                self._send_json(400, {"error": str(e)})

    return Handler


def run_web(
    host: str,
    port: int,
    *,
    open_browser: bool = True,
    default_design: Path = DEFAULT_DESIGN,
    default_words: Path = DEFAULT_WORDS,
    default_terms: Path = DEFAULT_TERMS,
    default_domains: Path = DEFAULT_DOMAINS,
    default_code_design: Path = DEFAULT_CODE_DESIGN,
    default_code_dir: Path = DEFAULT_CODE_DIR,
    word_xlsx: Path = DEFAULT_WORD_XLSX,
    term_xlsx: Path = DEFAULT_TERM_XLSX,
    domain_xlsx: Path = DEFAULT_DOMAIN_XLSX,
    code_xlsx: Path = DEFAULT_CODE_XLSX,
) -> None:
    work_dir = DEFAULT_DIR / ".chkdbstd_tmp"
    work_dir.mkdir(exist_ok=True)
    handler = create_handler(
        word_xlsx=word_xlsx,
        term_xlsx=term_xlsx,
        domain_xlsx=domain_xlsx,
        code_xlsx=code_xlsx,
        word_dict_xlsx=DEFAULT_WORD_DICT_XLSX,
        term_dict_xlsx=DEFAULT_TERM_DICT_XLSX,
        work_dir=work_dir,
        default_design=default_design,
        default_words=default_words,
        default_terms=default_terms,
        default_domains=default_domains,
        default_code_design=default_code_design,
        default_code_dir=default_code_dir,
    )
    server = ThreadingHTTPServer((host, port), handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"웹화면: {url}")
    print(f"기본 설계서: {default_design}")
    print(f"기본 표준단어: {default_words}")
    print(f"기본 표준용어: {default_terms}")
    print(f"기본 표준도메인: {default_domains}")
    print(f"기본 코드정의서: {default_code_design}")
    print(f"표준코드 폴더: {default_code_dir}")
    print("종료: Ctrl+C")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n종료합니다.")
    finally:
        server.server_close()


def run_cli(args: argparse.Namespace) -> None:
    kind = args.kind
    if kind == "word":
        match_df, review_df, unmatched_df, payload = run_word_match(
            args.design, args.words
        )
        try:
            save_excel_tri(
                match_df, review_df, unmatched_df, args.word_output, WORD_MATCH_COLS
            )
            excel_msg = str(args.word_output)
        except PermissionError:
            excel_msg = f"{args.word_output} (저장 실패: 파일이 열려 있음)"
        s = payload["stats"]
        print(
            f"[word] 총 {s['total_cols']} / 매칭 {s['matched_cols']} / "
            f"확인필요 {s['review_cols']} / 미매칭 {s['unmatched_cols']}"
        )
    elif kind == "term":
        match_df, review_df, unmatched_df, payload = run_term_match(
            args.design, args.terms, args.words
        )
        try:
            save_excel_tri(
                match_df, review_df, unmatched_df, args.term_output, TERM_MATCH_COLS
            )
            excel_msg = str(args.term_output)
        except PermissionError:
            excel_msg = f"{args.term_output} (저장 실패: 파일이 열려 있음)"
        s = payload["stats"]
        print(
            f"[term] 총 {s['total_cols']} / 매칭 {s['matched_cols']} / "
            f"확인필요 {s['review_cols']} / 미매칭 {s['unmatched_cols']}"
        )
    elif kind == "code":
        match_df, review_df, unmatched_df, payload = run_code_check(
            args.code_design, args.code_dir
        )
        try:
            save_code_excel(match_df, review_df, unmatched_df, args.code_output)
            excel_msg = str(args.code_output)
        except PermissionError:
            excel_msg = f"{args.code_output} (저장 실패: 파일이 열려 있음)"
        s = payload["stats"]
        print(
            f"[code] 코드종류 {s['total_cols']} / 행 {s['total_rows']} / "
            f"매칭 {s['matched_cols']} / 확인필요 {s['review_cols']} / "
            f"미매칭 {s['unmatched_cols']} (표준파일 {s['std_files']})"
        )
    else:
        match_df, review_df, unmatched_df, payload = run_domain_check(
            args.design, args.terms, args.domains
        )
        try:
            save_domain_excel(match_df, review_df, unmatched_df, args.domain_output)
            excel_msg = str(args.domain_output)
        except PermissionError:
            excel_msg = f"{args.domain_output} (저장 실패: 파일이 열려 있음)"
        s = payload["stats"]
        print(
            f"[domain] 총 {s['total_cols']} / 매칭 {s['matched_cols']} / "
            f"확인필요 {s['review_cols']} / 미매칭 {s['unmatched_cols']}"
        )
    print(f"Excel: {excel_msg}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="행안부 표준단어/용어/도메인/코드 점검")
    p.add_argument("--cli", action="store_true", help="웹 UI 대신 1회 실행")
    p.add_argument(
        "--kind",
        choices=["word", "term", "domain", "code"],
        default="word",
        help="CLI 점검 종류",
    )
    p.add_argument("--design", type=Path, default=DEFAULT_DESIGN)
    p.add_argument("--words", type=Path, default=DEFAULT_WORDS)
    p.add_argument("--terms", type=Path, default=DEFAULT_TERMS)
    p.add_argument("--domains", type=Path, default=DEFAULT_DOMAINS)
    p.add_argument("--code-design", type=Path, default=DEFAULT_CODE_DESIGN)
    p.add_argument("--code-dir", type=Path, default=DEFAULT_CODE_DIR)
    p.add_argument("--word-output", type=Path, default=DEFAULT_WORD_XLSX)
    p.add_argument("--term-output", type=Path, default=DEFAULT_TERM_XLSX)
    p.add_argument("--domain-output", type=Path, default=DEFAULT_DOMAIN_XLSX)
    p.add_argument("--code-output", type=Path, default=DEFAULT_CODE_XLSX)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--no-open", action="store_true")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    if args.cli:
        run_cli(args)
    else:
        run_web(
            args.host,
            args.port,
            open_browser=not args.no_open,
            default_design=args.design,
            default_words=args.words,
            default_terms=args.terms,
            default_domains=args.domains,
            default_code_design=args.code_design,
            default_code_dir=args.code_dir,
            word_xlsx=args.word_output,
            term_xlsx=args.term_output,
            domain_xlsx=args.domain_output,
            code_xlsx=args.code_output,
        )


if __name__ == "__main__":
    main()
