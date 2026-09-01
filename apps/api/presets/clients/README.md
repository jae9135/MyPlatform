# Frozen scenario presets (납품·감사용)

웹 품질 **「프리셋 JSON 저장」** 으로 내보낸 파일을 기관·프로젝트별로 보관합니다.

## 파일명 예

- `wq-preset-external-2026-09-01.json`
- `{기관코드}-ipms-public-v1.json`

## JSON 필드

- `preset_version`, `exported_at`, `mode`, `page_url`, `defaults_selected`, `candidates`

## 사용

1. 웹 품질에서 시나리오 선택 → 「프리셋 JSON 저장」
2. 이 폴더(또는 Git tag)에 커밋
3. 성능 진단 perf-test에서 동일 `state_ids` 선택
4. 보고서 표지에 preset 파일명·날짜 기록

Phase 3에서 API import(`preset_id`) 연동 예정.
