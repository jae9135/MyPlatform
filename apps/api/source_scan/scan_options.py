from __future__ import annotations

from dataclasses import dataclass

from source_scan.exclude import DEFAULT_EXCLUDE_GLOBS, parse_exclude_globs

DEFAULT_PMD_RULESETS = (
    "category/java/bestpractices.xml,"
    "category/java/errorprone.xml,"
    "category/java/security.xml"
)


@dataclass
class ScanOptions:
    try_java_build: bool = True
    try_eslint_zip: bool = False
    pmd_rulesets: str = ""
    exclude_globs: list[str] | None = None
    spotbugs_effort: str = "max"
    spotbugs_threshold: str = "low"
    use_prebuilt_classes: bool = True
    zip_max_bytes: int = 200 * 1024 * 1024
    zip_warn_bytes: int = 50 * 1024 * 1024

    @classmethod
    def from_form(
        cls,
        *,
        try_java_build: str = "true",
        try_eslint_zip: str = "false",
        pmd_rulesets: str = "",
        exclude_paths: str = "",
        spotbugs_effort: str = "max",
        spotbugs_threshold: str = "low",
        use_prebuilt_classes: str = "true",
    ) -> "ScanOptions":
        return cls(
            try_java_build=(try_java_build or "true").lower() not in ("0", "false", "no"),
            try_eslint_zip=(try_eslint_zip or "false").lower() in ("1", "true", "yes"),
            pmd_rulesets=(pmd_rulesets or "").strip(),
            exclude_globs=parse_exclude_globs(exclude_paths),
            spotbugs_effort=(spotbugs_effort or "max").strip() or "max",
            spotbugs_threshold=(spotbugs_threshold or "low").strip() or "low",
            use_prebuilt_classes=(use_prebuilt_classes or "true").lower() not in ("0", "false", "no"),
        )

    def effective_exclude(self) -> list[str]:
        return self.exclude_globs or list(DEFAULT_EXCLUDE_GLOBS)

    def effective_pmd_rulesets(self) -> str:
        if self.pmd_rulesets:
            return self.pmd_rulesets
        import os

        return os.environ.get(
            "PMD_RULESETS",
            DEFAULT_PMD_RULESETS,
        )
