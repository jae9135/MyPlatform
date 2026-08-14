"""MyPlatform API — 업로드 → 처리 → 결과 반환. 서버에 결과 미보관."""

from __future__ import annotations

import io
import os
import sys
import tempfile
import zipfile
from pathlib import Path

from pydantic import BaseModel, Field

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

APP_DIR = Path(__file__).resolve().parent
DEFAULT_CHK_DIR = Path(os.getenv("CHKDBSTD_DIR", str(APP_DIR / "chkdbstd")))
DEFAULT_DBMANAGER_DIR = Path(
    os.getenv("DBMANAGER_DIR", str(APP_DIR / "dbmanager"))
)
SAMPLES_DIR = APP_DIR / "samples"
DBMANAGER_SAMPLES_DIR = SAMPLES_DIR / "dbmanager"

SAMPLE_CATALOG = [
    {
        "id": "design",
        "title": "샘플 테이블정의서",
        "filename": "design.sample.xlsx",
        "kinds": ["word", "term", "domain"],
        "description": "표준단어·용어·도메인 점검용 설계서 샘플",
    },
    {
        "id": "code-design",
        "title": "샘플 코드정의서",
        "filename": "code-design.sample.xlsx",
        "kinds": ["code"],
        "description": "표준코드 점검용 코드정의서 샘플",
    },
]

DBMANAGER_SAMPLE_CATALOG = [
    {
        "id": "design",
        "title": "샘플 테이블정의서",
        "filename": "design.sample.xlsx",
        "description": "PostgreSQL DDL 생성용 테이블정의서 샘플",
    },
]

app = FastAPI(title="MyPlatform API", version="0.4.0")


class ApplySqlBody(BaseModel):
    step: str = Field(..., description="schema|table|sample")
    sql: str = Field(..., description="SQL script to execute")
    target_schema: str | None = Field(
        None, description="Apply objects under this schema (rewrites SQL)"
    )
    source_schemas: list[str] = Field(
        default_factory=list,
        description="Legacy schema names in SQL; rewritten to target_schema",
    )
    table_names: list[str] = Field(
        default_factory=list,
        description="Table names from design; used to qualify SQL at apply time",
    )
    target_db_name: str | None = Field(
        None, description="Design database label (Supabase uses linked DB)"
    )


class ApplyAlterBody(BaseModel):
    sql: str = Field(..., description="ALTER/COMMENT/CREATE TABLE script")
    include_caution: bool = Field(
        False, description="Allow ALTER COLUMN / ADD COLUMN NOT NULL"
    )
    dry_run: bool = Field(False, description="Validate only; do not execute")


class DataRowBody(BaseModel):
    schema_name: str = Field(..., alias="schema")
    table: str
    pk: dict = Field(default_factory=dict)
    values: dict = Field(default_factory=dict)

    model_config = {"populate_by_name": True}

origins = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:3000,http://localhost:3000",
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """When API_ACCESS_KEY is set, require X-Api-Key (portal proxy sends it)."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in ("/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)
        expected = (os.getenv("API_ACCESS_KEY") or "").strip()
        if not expected:
            return await call_next(request)
        got = request.headers.get("x-api-key") or ""
        if got != expected:
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)


app.add_middleware(ApiKeyMiddleware)


def _ensure_api_path() -> None:
    api_parent = str(APP_DIR)
    if api_parent not in sys.path:
        sys.path.insert(0, api_parent)


def _db_configured() -> bool:
    try:
        _ensure_api_path()
        from dbmanager.db_client import is_db_configured  # type: ignore

        return is_db_configured()
    except Exception:
        return bool((os.getenv("DATABASE_URL") or "").strip())


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "chkdbstd_dir": str(DEFAULT_CHK_DIR),
        "chkdbstd_found": (DEFAULT_CHK_DIR / "chk_std_word.py").exists(),
        "dbmanager_dir": str(DEFAULT_DBMANAGER_DIR),
        "dbmanager_found": (DEFAULT_DBMANAGER_DIR / "service.py").exists(),
        "db_configured": _db_configured(),
        "samples": sum(
            1 for s in SAMPLE_CATALOG if (SAMPLES_DIR / s["filename"]).exists()
        ),
        "dbmanager_samples": sum(
            1
            for s in DBMANAGER_SAMPLE_CATALOG
            if (DBMANAGER_SAMPLES_DIR / s["filename"]).exists()
        ),
    }


def _load_chk_module():
    chk_py = DEFAULT_CHK_DIR / "chk_std_word.py"
    if not chk_py.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "ChkDBStd 소스를 찾을 수 없습니다. "
                "CHKDBSTD_DIR 환경변수를 설정하거나 apps/api에 로직을 이식하세요."
            ),
        )
    if str(DEFAULT_CHK_DIR) not in sys.path:
        sys.path.insert(0, str(DEFAULT_CHK_DIR))
    import chk_std_word as m  # type: ignore

    return m


def _load_dbmanager():
    service_py = DEFAULT_DBMANAGER_DIR / "service.py"
    if not service_py.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "DBManager 소스를 찾을 수 없습니다. "
                "apps/api/dbmanager 번들을 확인하세요."
            ),
        )
    _ensure_api_path()
    import dbmanager.service as svc  # type: ignore

    return svc


def _load_db_client():
    client_py = DEFAULT_DBMANAGER_DIR / "db_client.py"
    if not client_py.exists():
        raise HTTPException(
            status_code=503,
            detail="dbmanager/db_client.py 가 없습니다.",
        )
    _ensure_api_path()
    import dbmanager.db_client as dbc  # type: ignore

    return dbc


async def _save_optional_upload(
    upload: UploadFile | None, tmp_path: Path, default_name: str
) -> Path | None:
    if upload is None or not upload.filename:
        return None
    raw = await upload.read()
    if not raw:
        return None
    path = tmp_path / (upload.filename or default_name)
    path.write_bytes(raw)
    return path


def _run_check(
    m,
    design_path: Path,
    kind: str,
    sheet_name: str | None = None,
    *,
    words_path: Path | None = None,
    terms_path: Path | None = None,
    domains_path: Path | None = None,
):
    words = words_path or m.DEFAULT_WORDS
    terms = terms_path or m.DEFAULT_TERMS
    domains = domains_path or m.DEFAULT_DOMAINS
    if kind == "word":
        match_df, review_df, unmatched_df, payload = m.run_word_match(
            design_path, words, sheet_name=sheet_name
        )
        return match_df, review_df, unmatched_df, payload, m.WORD_MATCH_COLS, "tri"
    if kind == "term":
        match_df, review_df, unmatched_df, payload = m.run_term_match(
            design_path, terms, words, sheet_name=sheet_name
        )
        return match_df, review_df, unmatched_df, payload, m.TERM_MATCH_COLS, "tri"
    if kind == "domain":
        match_df, review_df, unmatched_df, payload = m.run_domain_check(
            design_path,
            terms,
            domains,
            sheet_name=sheet_name,
        )
        return match_df, review_df, unmatched_df, payload, None, "domain"
    match_df, review_df, unmatched_df, payload = m.run_code_check(
        design_path, m.DEFAULT_CODE_DIR, sheet_name=sheet_name
    )
    return match_df, review_df, unmatched_df, payload, None, "code"


def _save_result_xlsx(m, kind_mode, match_df, review_df, unmatched_df, cols, out_path):
    if kind_mode == "tri":
        m.save_excel_tri(match_df, review_df, unmatched_df, out_path, cols)
    elif kind_mode == "domain":
        m.save_domain_excel(match_df, review_df, unmatched_df, out_path)
    else:
        m.save_code_excel(match_df, review_df, unmatched_df, out_path)


def _save_dictionary_xlsx(
    m,
    kind: str,
    match_df,
    review_df,
    unmatched_df,
    out_path: Path,
    *,
    words_path: Path | None = None,
    terms_path: Path | None = None,
):
    words = words_path or m.DEFAULT_WORDS
    terms = terms_path or m.DEFAULT_TERMS
    if kind == "word":
        m.build_word_dictionary_file(
            match_df, review_df, unmatched_df, words, out_path
        )
        return "chkdbstd_used_word_dictionary.xlsx"
    if kind == "term":
        m.build_term_dictionary_file(
            match_df,
            review_df,
            unmatched_df,
            terms,
            words,
            out_path,
        )
        return "chkdbstd_used_term_dictionary.xlsx"
    raise HTTPException(
        400, detail="단어집/용어집은 kind=word 또는 term 일 때만 가능합니다."
    )


@app.get("/v1/chk-db-std/samples")
def list_samples() -> dict:
    items = []
    for s in SAMPLE_CATALOG:
        path = SAMPLES_DIR / s["filename"]
        if not path.exists():
            continue
        items.append(
            {
                **s,
                "bytes": path.stat().st_size,
                "download_path": f"/v1/chk-db-std/samples/{s['id']}",
            }
        )
    return {"items": items}


@app.get("/v1/chk-db-std/samples/{sample_id}")
def download_sample(sample_id: str):
    meta = next((s for s in SAMPLE_CATALOG if s["id"] == sample_id), None)
    if not meta:
        raise HTTPException(404, detail="unknown sample id")
    path = SAMPLES_DIR / meta["filename"]
    if not path.exists():
        raise HTTPException(404, detail="sample file missing on server")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=meta["filename"],
    )


@app.post("/v1/chk-db-std/validate")
async def validate_chk_db_std(
    design: UploadFile = File(...),
    kind: str = Form("word"),
    sheet: str = Form(""),
) -> dict:
    """설계서/코드정의서 Excel 파싱 가능 여부 확인 (점검 실행 전)."""
    if kind not in ("word", "term", "domain", "code"):
        raise HTTPException(400, detail="kind must be word|term|domain|code")

    raw = await design.read()
    if not raw:
        raise HTTPException(400, detail="empty design file")

    m = _load_chk_module()
    sheet_name = sheet.strip() or None
    with tempfile.TemporaryDirectory(prefix="myplatform_chk_val_") as tmp:
        design_path = Path(tmp) / (design.filename or "design.xlsx")
        design_path.write_bytes(raw)
        try:
            payload = m.validate_check_design(
                design_path, kind=kind, sheet_name=sheet_name
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    if not payload.get("can_check"):
        raise HTTPException(status_code=400, detail=payload.get("message", "확인 실패"))
    return payload


@app.post("/v1/chk-db-std/generate-terms")
async def generate_chk_terms(
    names: str = Form(""),
    terms_csv: UploadFile | None = File(None),
    words_csv: UploadFile | None = File(None),
) -> dict:
    """한글명(줄 단위) → 표준용어 조회·단어조합."""
    parsed = [n.strip() for n in names.replace("\r\n", "\n").split("\n") if n.strip()]
    if not parsed:
        raise HTTPException(400, detail="한글명을 한 줄에 하나씩 입력하세요.")

    m = _load_chk_module()
    with tempfile.TemporaryDirectory(prefix="myplatform_chk_gt_") as tmp:
        tmp_path = Path(tmp)
        words_path = await _save_optional_upload(words_csv, tmp_path, "words.csv")
        terms_path = await _save_optional_upload(terms_csv, tmp_path, "terms.csv")
        words = words_path or m.DEFAULT_WORDS
        terms = terms_path or m.DEFAULT_TERMS
        try:
            terms_df = m.load_standard_terms(terms)
            words_df = m.load_standard_words(words)
            items = m.generate_standard_terms_for_names(parsed, terms_df, words_df)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    return {"ok": True, "count": len(items), "items": items}


@app.post("/v1/chk-db-std/run")
async def run_chk_db_std(
    design: UploadFile = File(...),
    kind: str = Form("word"),
    format: str = Form("json"),
    sheet: str = Form(""),
    words_csv: UploadFile | None = File(None),
    terms_csv: UploadFile | None = File(None),
    domains_csv: UploadFile | None = File(None),
):
    """설계서 업로드 → 점검. format=json|xlsx|word-dict|term-dict."""
    if kind not in ("word", "term", "domain", "code"):
        raise HTTPException(400, detail="kind must be word|term|domain|code")
    fmt = (format or "json").lower().strip()
    if fmt not in ("json", "xlsx", "word-dict", "term-dict"):
        raise HTTPException(
            400, detail="format must be json|xlsx|word-dict|term-dict"
        )
    if fmt == "word-dict" and kind != "word":
        raise HTTPException(400, detail="word-dict requires kind=word")
    if fmt == "term-dict" and kind != "term":
        raise HTTPException(400, detail="term-dict requires kind=term")

    raw = await design.read()
    if not raw:
        raise HTTPException(400, detail="empty design file")

    m = _load_chk_module()
    sheet_name = sheet.strip() or None

    with tempfile.TemporaryDirectory(prefix="myplatform_chk_") as tmp:
        tmp_path = Path(tmp)
        design_path = tmp_path / (design.filename or "design.xlsx")
        design_path.write_bytes(raw)
        out_path = tmp_path / "result.xlsx"
        words_path = await _save_optional_upload(words_csv, tmp_path, "words.csv")
        terms_path = await _save_optional_upload(terms_csv, tmp_path, "terms.csv")
        domains_path = await _save_optional_upload(
            domains_csv, tmp_path, "domains.csv"
        )

        try:
            check = m.validate_check_design(
                design_path, kind=kind, sheet_name=sheet_name
            )
            if not check.get("can_check"):
                raise HTTPException(
                    status_code=400,
                    detail=check.get("message", "설계서 형식 확인 실패"),
                )
            match_df, review_df, unmatched_df, payload, cols, mode = _run_check(
                m,
                design_path,
                kind,
                sheet_name,
                words_path=words_path,
                terms_path=terms_path,
                domains_path=domains_path,
            )
            fname = f"chkdbstd_{kind}_result.xlsx"
            if fmt == "xlsx":
                _save_result_xlsx(
                    m, mode, match_df, review_df, unmatched_df, cols, out_path
                )
                data = out_path.read_bytes()
            elif fmt in ("word-dict", "term-dict"):
                fname = _save_dictionary_xlsx(
                    m,
                    kind,
                    match_df,
                    review_df,
                    unmatched_df,
                    out_path,
                    words_path=words_path,
                    terms_path=terms_path,
                )
                data = out_path.read_bytes()
            else:
                data = None
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        if fmt == "json":
            return JSONResponse(
                {
                    "ok": True,
                    "kind": kind,
                    "source_filename": design.filename or "design.xlsx",
                    **payload,
                }
            )

    return StreamingResponse(
        io.BytesIO(data or b""),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@app.get("/v1/db-manager/samples")
def list_dbmanager_samples() -> dict:
    items = []
    for s in DBMANAGER_SAMPLE_CATALOG:
        path = DBMANAGER_SAMPLES_DIR / s["filename"]
        if not path.exists():
            continue
        items.append(
            {
                **s,
                "bytes": path.stat().st_size,
                "download_path": f"/v1/db-manager/samples/{s['id']}",
            }
        )
    return {"items": items}


@app.get("/v1/db-manager/samples/{sample_id}")
def download_dbmanager_sample(sample_id: str):
    meta = next((s for s in DBMANAGER_SAMPLE_CATALOG if s["id"] == sample_id), None)
    if not meta:
        raise HTTPException(404, detail="unknown sample id")
    path = DBMANAGER_SAMPLES_DIR / meta["filename"]
    if not path.exists():
        raise HTTPException(404, detail="sample file missing on server")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=meta["filename"],
    )


@app.post("/v1/db-manager/validate")
async def validate_dbmanager_design(
    design: UploadFile = File(...),
    sheet: str = Form(""),
) -> dict:
    """테이블정의서 Excel 파싱 가능 여부만 확인 (DDL 생성 없음)."""
    raw = await design.read()
    if not raw:
        raise HTTPException(400, detail="empty design file")

    svc = _load_dbmanager()
    sheet_name = sheet.strip() or None
    try:
        payload = svc.validate_design_from_upload(raw, sheet_name=sheet_name)
    except Exception as e:
        return {
            "ok": False,
            "can_generate": False,
            "source_filename": design.filename or "design.xlsx",
            "message": str(e),
        }

    return {
        **payload,
        "source_filename": design.filename or "design.xlsx",
    }


@app.post("/v1/db-manager/generate")
async def generate_dbmanager_ddl(
    design: UploadFile = File(...),
    sheet: str = Form(""),
    format: str = Form("json"),
):
    """테이블정의서 → PostgreSQL DDL. format=json|zip. 서버 미보관."""
    fmt = (format or "json").lower().strip()
    if fmt not in ("json", "zip"):
        raise HTTPException(400, detail="format must be json|zip")

    raw = await design.read()
    if not raw:
        raise HTTPException(400, detail="empty design file")

    svc = _load_dbmanager()
    sheet_name = sheet.strip() or None

    with tempfile.TemporaryDirectory(prefix="myplatform_dbm_") as tmp:
        tmp_path = Path(tmp)
        out_dir = tmp_path / "ddl"
        try:
            result = svc.generate_from_upload(
                raw, sheet_name=sheet_name, output_dir=out_dir
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        resolved_sheet = result.get("sheet") or sheet.strip() or "테이블정의서"

        if fmt == "json":
            return JSONResponse(
                {
                    "ok": True,
                    "source_filename": design.filename or "design.xlsx",
                    "sheet": resolved_sheet,
                    "design_format": result.get("design_format"),
                    "tables": result["tables"],
                    "scripts": result["scripts"],
                    "grouped": result["grouped"],
                    "db_name": result["db_name"],
                }
            )

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for script in result["scripts"]:
                zf.writestr(script["name"], script["content"])
        buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="dbmanager_ddl.zip"'
        },
    )


@app.get("/v1/db-manager/db-status")
def dbmanager_db_status() -> dict:
    """Supabase/Postgres 연결 가능 여부 (비밀번호 미포함)."""
    dbc = _load_db_client()
    if not dbc.is_db_configured():
        return {
            "ok": False,
            "configured": False,
            "target": None,
            "database_name": None,
            "message": (
                "DATABASE_URL(또는 POSTGRES_*) 환경변수가 없습니다. "
                "Render/로컬 API에 Supabase DB URI를 설정하세요."
            ),
        }
    try:
        target = dbc.masked_target()
        database_name = dbc.connected_database_name()
    except Exception as e:
        return {
            "ok": False,
            "configured": True,
            "target": None,
            "database_name": None,
            "message": str(e),
        }
    ok, message = dbc.test_connection()
    return {
        "ok": ok,
        "configured": True,
        "target": target,
        "database_name": database_name,
        "message": message,
    }


@app.get("/v1/db-manager/run-events")
def dbmanager_run_events(limit: int = Query(20, ge=1, le=100)) -> dict:
    dbc = _require_db_ready()
    _ensure_api_path()
    from dbmanager.events import list_run_events  # type: ignore

    try:
        items = list_run_events(limit)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True, "target": dbc.masked_target(), "items": items}


def _require_db_ready():
    dbc = _load_db_client()
    if not dbc.is_db_configured():
        raise HTTPException(
            503,
            detail="DATABASE_URL이 설정되지 않았습니다.",
        )
    ok, message = dbc.test_connection()
    if not ok:
        raise HTTPException(400, detail=f"Connection failed: {message}")
    return dbc


def _load_schema_reader():
    _ensure_api_path()
    from dbmanager import schema_reader  # type: ignore

    return schema_reader


def _load_excel_writer():
    _ensure_api_path()
    from dbmanager import excel_writer  # type: ignore

    return excel_writer


def _load_data_manager():
    _ensure_api_path()
    from dbmanager import data_manager  # type: ignore

    return data_manager


def _log_event(kind: str, ok: bool, detail: dict | None = None) -> None:
    try:
        _ensure_api_path()
        from dbmanager.events import log_run_event  # type: ignore

        log_run_event(kind, ok=ok, detail=detail or {})
    except Exception:
        return


def _load_schema_diff():
    _ensure_api_path()
    from dbmanager import schema_diff  # type: ignore

    return schema_diff


@app.get("/v1/db-manager/schemas")
def dbmanager_list_schemas() -> dict:
    """사용자 스키마 목록 (시스템/Supabase 관리 스키마 제외)."""
    dbc = _require_db_ready()
    sr = _load_schema_reader()
    try:
        schemas = sr.list_schemas()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {
        "ok": True,
        "target": dbc.masked_target(),
        "schemas": schemas,
    }


@app.get("/v1/db-manager/schemas/{schema}/tables")
def dbmanager_list_tables(schema: str) -> dict:
    """스키마 내 테이블 목록."""
    dbc = _require_db_ready()
    sr = _load_schema_reader()
    try:
        tables = sr.list_tables(schema)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {
        "ok": True,
        "target": dbc.masked_target(),
        "schema": schema,
        "tables": tables,
    }


@app.post("/v1/db-manager/export-design")
async def dbmanager_export_design(
    schema: str = Form(...),
    tables: str = Form(""),
    db_name: str = Form("dbm"),
    sheet: str = Form(""),
    design: UploadFile | None = File(None),
):
    """DB 스키마를 테이블정의서 Excel로 반영해 다운로드 (서버 미보관).

    tables: 쉼표 구분 테이블명. 비우면 스키마 전체.
    design: 필수(또는 설계서→스크립트에서 불러온 양식). 해당 양식에 병합.
    sheet: 시트명. 비우면 양식에서 자동 감지.
    """
    dbc = _require_db_ready()
    sr = _load_schema_reader()
    ew = _load_excel_writer()

    schema_name = (schema or "").strip()
    if not schema_name:
        raise HTTPException(400, detail="schema is required")

    table_list = [
        t.strip() for t in (tables or "").split(",") if t.strip()
    ] or None
    db_label = (db_name or "dbm").strip() or "dbm"

    template_bytes: bytes | None = None
    if design is not None and design.filename:
        template_bytes = await design.read()
        if not template_bytes:
            raise HTTPException(400, detail="empty design file")
    if not template_bytes:
        raise HTTPException(
            400,
            detail="설계서 양식 Excel 파일(design)이 필요합니다.",
        )

    sheet_name = (sheet or "").strip() or None

    try:
        db_tables = sr.read_schema(schema_name, table_names=table_list)
        if not db_tables:
            raise HTTPException(
                400,
                detail=f"No tables found in schema '{schema_name}'.",
            )
        template_src = io.BytesIO(template_bytes)
        data = ew.write_schema_to_excel_bytes(
            db_tables,
            db_name=db_label,
            schema_name=schema_name,
            template=template_src,
            sheet_name=sheet_name,
        )
        fname = ew.default_export_filename(schema_name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return StreamingResponse(
        io.BytesIO(data),
        media_type=(
            "application/vnd.openxmlformats-officedocument"
            ".spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"',
            "X-Table-Count": str(len(db_tables)),
            "X-Db-Target": dbc.masked_target(),
        },
    )


@app.get("/v1/db-manager/schemas/{schema}/tables/{table}/rows")
def dbmanager_table_rows(
    schema: str,
    table: str,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str = Query("", description="text search"),
    format: str = Query("json", description="json|csv|xlsx"),
):
    """테이블 데이터 조회 (SELECT만). format=csv|xlsx 이면 파일 다운로드."""
    dbc = _require_db_ready()
    dm = _load_data_manager()
    fmt = (format or "json").lower().strip()
    try:
        if fmt in ("csv", "xlsx"):
            data, fname, media = dm.export_table_data(
                schema, table, q=q, fmt=fmt
            )
            return StreamingResponse(
                io.BytesIO(data),
                media_type=media,
                headers={
                    "Content-Disposition": f'attachment; filename="{fname}"'
                },
            )
        payload = dm.query_table_data(
            schema, table, limit=limit, offset=offset, q=q
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True, "target": dbc.masked_target(), **payload}


@app.post("/v1/db-manager/data-upload")
async def dbmanager_data_upload(
    schema: str = Form(...),
    table: str = Form(...),
    on_conflict: str = Form("skip"),
    preview: str = Form("false"),
    file: UploadFile = File(...),
) -> dict:
    """CSV/Excel 행 INSERT. preview=true 이면 미리보기만."""
    dbc = _require_db_ready()
    dm = _load_data_manager()
    raw = await file.read()
    if not raw:
        raise HTTPException(400, detail="empty upload file")
    is_preview = str(preview).strip().lower() in ("1", "true", "yes")
    try:
        if is_preview:
            result = dm.preview_upload(
                schema, table, raw, file.filename or ""
            )
            return {"ok": True, "preview": True, "target": dbc.masked_target(), **result}
        result = dm.upload_table_data(
            schema,
            table,
            raw,
            file.filename or "",
            on_conflict=on_conflict,
        )
    except Exception as e:
        _log_event("data-upload", False, {"schema": schema, "table": table})
        raise HTTPException(status_code=400, detail=str(e)) from e
    _log_event(
        "data-upload",
        True,
        {
            "schema": schema,
            "table": table,
            "inserted": result.get("inserted"),
            "updated": result.get("updated"),
            "skipped": result.get("skipped"),
            "errors": len(result.get("errors") or []),
        },
    )
    return {
        "ok": True,
        "target": dbc.masked_target(),
        "message": (
            f"inserted {result['inserted']}, updated {result['updated']}, "
            f"skipped {result['skipped']}"
        ),
        **result,
    }


@app.post("/v1/db-manager/data-row")
def dbmanager_update_row(body: DataRowBody) -> dict:
    dbc = _require_db_ready()
    dm = _load_data_manager()
    try:
        result = dm.update_table_row(
            body.schema_name, body.table, body.pk, body.values
        )
    except Exception as e:
        _log_event("data-update", False, {"table": body.table})
        raise HTTPException(status_code=400, detail=str(e)) from e
    _log_event("data-update", True, {"schema": body.schema_name, "table": body.table})
    return {"ok": True, "target": dbc.masked_target(), **result}


@app.post("/v1/db-manager/data-delete")
def dbmanager_delete_row(body: DataRowBody) -> dict:
    dbc = _require_db_ready()
    dm = _load_data_manager()
    try:
        result = dm.delete_table_row(body.schema_name, body.table, body.pk)
    except Exception as e:
        _log_event("data-delete", False, {"table": body.table})
        raise HTTPException(status_code=400, detail=str(e)) from e
    _log_event("data-delete", True, {"schema": body.schema_name, "table": body.table})
    return {"ok": True, "target": dbc.masked_target(), **result}


@app.post("/v1/db-manager/diff")
async def dbmanager_diff(
    design: UploadFile = File(...),
    sheet: str = Form(""),
) -> dict:
    """설계서 vs DB 스키마 비교. DROP은 생성하지 않음."""
    dbc = _require_db_ready()
    _ensure_api_path()
    from dbmanager.excel_parser import parse_excel_with_meta  # type: ignore

    sr = _load_schema_reader()
    sd = _load_schema_diff()
    raw = await design.read()
    if not raw:
        raise HTTPException(400, detail="empty design file")
    try:
        parsed = parse_excel_with_meta(io.BytesIO(raw), sheet.strip() or None)
        tables = parsed.tables
        if not tables:
            raise ValueError("Excel에서 테이블 정의를 찾지 못했습니다.")
        db_tables = []
        for schema_name in sorted({t.schema for t in tables}):
            db_tables.extend(sr.read_schema(schema_name))
        payload = sd.diff_design_to_db(tables, db_tables)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    _log_event(
        "diff",
        True,
        {"tables": len(tables), "changes": len(payload.get("changes") or [])},
    )
    return {
        "ok": True,
        "target": dbc.masked_target(),
        "sheet": parsed.sheet_name,
        "design_format": parsed.format,
        "source_filename": design.filename or "design.xlsx",
        "design_tables": len(tables),
        **payload,
    }


@app.post("/v1/db-manager/apply-alter")
def dbmanager_apply_alter(body: ApplyAlterBody) -> dict:
    """diff에서 만든 ALTER/COMMENT/CREATE TABLE만 적용. DROP 금지."""
    dbc = _require_db_ready()
    sd = _load_schema_diff()
    try:
        sql = sd.validate_alter_sql(body.sql, allow_caution=body.include_caution)
        if body.dry_run:
            _log_event("apply-alter", True, {"dry_run": True})
            return {
                "ok": True,
                "dry_run": True,
                "target": dbc.masked_target(),
                "message": "Validation OK (not executed).",
                "include_caution": body.include_caution,
            }
        dbc.execute_sql(sql, autocommit=True)
    except Exception as e:
        _log_event("apply-alter", False, {"dry_run": body.dry_run})
        raise HTTPException(status_code=400, detail=str(e)) from e
    _log_event("apply-alter", True, {"dry_run": False})
    return {
        "ok": True,
        "dry_run": False,
        "target": dbc.masked_target(),
        "message": "ALTER script executed successfully.",
        "include_caution": body.include_caution,
    }


@app.post("/v1/db-manager/apply")
def dbmanager_apply(body: ApplySqlBody) -> dict:
    """생성된 DDL을 서버 DATABASE_URL(Supabase)에 적용. step=schema|table|sample."""
    step = (body.step or "").strip().lower()
    if step == "database":
        raise HTTPException(
            400,
            detail=(
                "CREATE DATABASE 단계는 Supabase에서 생략합니다. "
                "기존 프로젝트 DB에 schema → table → sample 순으로 적용하세요."
            ),
        )
    if step not in ("schema", "table", "sample"):
        raise HTTPException(400, detail="step must be schema|table|sample")

    sql = (body.sql or "").strip()
    if not sql:
        raise HTTPException(400, detail="SQL script is empty.")

    target_schema = (body.target_schema or "").strip()
    source_schemas = [s.strip() for s in (body.source_schemas or []) if s.strip()]
    table_names = [s.strip() for s in (body.table_names or []) if s.strip()]
    if target_schema:
        from dbmanager.sql_rewrite import rewrite_sql_schema  # type: ignore

        try:
            sql = rewrite_sql_schema(
                sql,
                target_schema=target_schema,
                source_schemas=source_schemas or None,
                table_names=table_names or None,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    dbc = _load_db_client()
    if not dbc.is_db_configured():
        raise HTTPException(
            503,
            detail="DATABASE_URL이 설정되지 않았습니다.",
        )

    ok, message = dbc.test_connection()
    if not ok:
        raise HTTPException(400, detail=f"Connection failed: {message}")

    allocations = None
    try:
        if step == "sample":
            # PK를 "1","2",… 형태로 DB 마지막 번호+1부터 재부여 후 INSERT
            allocations = dbc.execute_sample_sql_with_next_pks(sql)
        else:
            # Multiple statements: use autocommit for DDL robustness on managed PG
            dbc.execute_sql(sql, autocommit=True)
    except Exception as e:
        _log_event(f"apply-{step}", False, {"step": step})
        raise HTTPException(status_code=400, detail=str(e)) from e

    labels = {
        "schema": "Schema created successfully.",
        "table": "Table script executed successfully.",
        "sample": "Sample data inserted successfully.",
    }
    message = labels[step]
    if step == "sample" and allocations:
        parts = [
            f"{t} → {info.get('from')}~{info.get('to')}"
            for t, info in allocations.items()
        ]
        if parts:
            message = f"{message} (PK: {', '.join(parts)})"

    _log_event(f"apply-{step}", True, {"step": step})
    return {
        "ok": True,
        "step": step,
        "target": dbc.masked_target(),
        "message": message,
        "applied_schema": target_schema or None,
        "applied_db_name": (body.target_db_name or "").strip() or None,
        **({"pk_allocations": allocations} if allocations is not None else {}),
    }
