# ChkDBStd (API bundle)

행안부 공통표준 점검 로직을 API에 이식한 디렉터리입니다.

| 파일 | 용도 |
|------|------|
| `chk_std_word.py` | 단어/용어/도메인/코드 점검 |
| `mois_standard_words.csv` | 공통표준단어 |
| `mois_standard_terms.csv` | 공통표준용어 |
| `mois_standard_domains.csv` | 공통표준도메인 |
| `code_download/downloads/.std_code_index.pkl` | 표준코드 인덱스 (대용량 xlsx 대신) |

대용량 `code_download/downloads/*.xlsx`는 git에 넣지 않습니다.
