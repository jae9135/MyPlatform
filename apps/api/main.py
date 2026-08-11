"""MyPlatform API — 업로드 → 점검 → 결과 다운로드 (서버에 결과 미보관)."""

from __future__ import annotations

import io
import os
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

APP_DIR = Path(__file__).resolve().parent
# Bundled port under apps/api/chkdbstd. Override with CHKDBSTD_DIR if needed.
DEFAULT_CHK_DIR = Path(
    os.getenv("CHKDBSTD_DIR", str(APP_DIR / "chkdbstd"))
)

app = FastAPI(title="MyPlatform API", version="0.1.0")

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


@app.post("/v1/chk-db-std/run")
async def run_chk_db_std(
    design: UploadFile = File(...),
    kind: str = Form("word"),
):
    """설계서 업로드 → 점검 → xlsx 스트리밍. 디스크에 결과 상주 저장 안 함."""
    if kind not in ("word", "term", "domain", "code"):
        raise HTTPException(400, detail="kind must be word|term|domain|code")

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
            if kind == "word":
                match_df, review_df, unmatched_df, _ = m.run_word_match(
                    design_path, m.DEFAULT_WORDS
                )
                m.save_excel_tri(
                    match_df, review_df, unmatched_df, out_path, m.WORD_MATCH_COLS
                )
            elif kind == "term":
                match_df, review_df, unmatched_df, _ = m.run_term_match(
                    design_path, m.DEFAULT_TERMS, m.DEFAULT_WORDS
                )
                m.save_excel_tri(
                    match_df, review_df, unmatched_df, out_path, m.TERM_MATCH_COLS
                )
            elif kind == "domain":
                match_df, review_df, unmatched_df, _ = m.run_domain_check(
                    design_path, m.DEFAULT_TERMS, m.DEFAULT_DOMAINS
                )
                m.save_domain_excel(match_df, review_df, unmatched_df, out_path)
            else:
                match_df, review_df, unmatched_df, _ = m.run_code_check(
                    design_path, m.DEFAULT_CODE_DIR
                )
                m.save_code_excel(match_df, review_df, unmatched_df, out_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        data = out_path.read_bytes()

    fname = f"chkdbstd_{kind}_result.xlsx"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
