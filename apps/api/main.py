"""MyPlatform API — 업로드 → 처리 → 결과 반환. 서버에 결과 미보관."""

from __future__ import annotations

import io
import os
import sys
import tempfile
import zipfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

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

app = FastAPI(title="MyPlatform API", version="0.3.0")

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


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "chkdbstd_dir": str(DEFAULT_CHK_DIR),
        "chkdbstd_found": (DEFAULT_CHK_DIR / "chk_std_word.py").exists(),
        "dbmanager_dir": str(DEFAULT_DBMANAGER_DIR),
        "dbmanager_found": (DEFAULT_DBMANAGER_DIR / "service.py").exists(),
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
    api_parent = str(APP_DIR)
    if api_parent not in sys.path:
        sys.path.insert(0, api_parent)
    import dbmanager.service as svc  # type: ignore

    return svc


def _run_check(m, design_path: Path, kind: str):
    if kind == "word":
        match_df, review_df, unmatched_df, payload = m.run_word_match(
            design_path, m.DEFAULT_WORDS
        )
        return match_df, review_df, unmatched_df, payload, m.WORD_MATCH_COLS, "tri"
    if kind == "term":
        match_df, review_df, unmatched_df, payload = m.run_term_match(
            design_path, m.DEFAULT_TERMS, m.DEFAULT_WORDS
        )
        return match_df, review_df, unmatched_df, payload, m.TERM_MATCH_COLS, "tri"
    if kind == "domain":
        match_df, review_df, unmatched_df, payload = m.run_domain_check(
            design_path, m.DEFAULT_TERMS, m.DEFAULT_DOMAINS
        )
        return match_df, review_df, unmatched_df, payload, None, "domain"
    match_df, review_df, unmatched_df, payload = m.run_code_check(
        design_path, m.DEFAULT_CODE_DIR
    )
    return match_df, review_df, unmatched_df, payload, None, "code"


def _save_result_xlsx(m, kind_mode, match_df, review_df, unmatched_df, cols, out_path):
    if kind_mode == "tri":
        m.save_excel_tri(match_df, review_df, unmatched_df, out_path, cols)
    elif kind_mode == "domain":
        m.save_domain_excel(match_df, review_df, unmatched_df, out_path)
    else:
        m.save_code_excel(match_df, review_df, unmatched_df, out_path)


def _save_dictionary_xlsx(m, kind: str, match_df, review_df, unmatched_df, out_path: Path):
    if kind == "word":
        m.build_word_dictionary_file(
            match_df, review_df, unmatched_df, m.DEFAULT_WORDS, out_path
        )
        return "chkdbstd_used_word_dictionary.xlsx"
    if kind == "term":
        m.build_term_dictionary_file(
            match_df,
            review_df,
            unmatched_df,
            m.DEFAULT_TERMS,
            m.DEFAULT_WORDS,
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


@app.post("/v1/chk-db-std/run")
async def run_chk_db_std(
    design: UploadFile = File(...),
    kind: str = Form("word"),
    format: str = Form("json"),
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

    with tempfile.TemporaryDirectory(prefix="myplatform_chk_") as tmp:
        tmp_path = Path(tmp)
        design_path = tmp_path / (design.filename or "design.xlsx")
        design_path.write_bytes(raw)
        out_path = tmp_path / "result.xlsx"

        try:
            match_df, review_df, unmatched_df, payload, cols, mode = _run_check(
                m, design_path, kind
            )
            fname = f"chkdbstd_{kind}_result.xlsx"
            if fmt == "xlsx":
                _save_result_xlsx(
                    m, mode, match_df, review_df, unmatched_df, cols, out_path
                )
                data = out_path.read_bytes()
            elif fmt in ("word-dict", "term-dict"):
                fname = _save_dictionary_xlsx(
                    m, kind, match_df, review_df, unmatched_df, out_path
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


@app.post("/v1/db-manager/generate")
async def generate_dbmanager_ddl(
    design: UploadFile = File(...),
    sheet: str = Form("테이블정의서"),
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

    with tempfile.TemporaryDirectory(prefix="myplatform_dbm_") as tmp:
        tmp_path = Path(tmp)
        out_dir = tmp_path / "ddl"
        try:
            result = svc.generate_from_upload(
                raw, sheet_name=sheet or "테이블정의서", output_dir=out_dir
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        if fmt == "json":
            return JSONResponse(
                {
                    "ok": True,
                    "source_filename": design.filename or "design.xlsx",
                    "sheet": sheet or "테이블정의서",
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
