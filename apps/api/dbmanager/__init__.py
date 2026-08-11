"""DBManager DDL generation bundle (Excel → PostgreSQL SQL)."""

from .service import generate_from_path, generate_from_upload

__all__ = ["generate_from_path", "generate_from_upload"]
