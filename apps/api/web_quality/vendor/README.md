# vendor

| 파일 | 출처 | 라이선스 |
|------|------|----------|
| `axe.min.js` | [axe-core](https://github.com/dequelabs/axe-core) 4.10.2 (npm `axe-core@4.10.2`, 원본 그대로) | MPL-2.0 — `axe-core.LICENSE` |

웹 품질 진단 시 axe 를 CDN 에서 내려받지 않고 이 파일을 페이지에 주입합니다.

- 점검 대상 사이트의 CSP(script-src)가 외부 스크립트를 막아도 동작
- 인터넷이 막힌 내부망 서버에서도 동작
- 버전을 고정해 진단 결과가 재현 가능

이 파일이 없으면 기존처럼 CDN(`AXE_CDN`)을 사용합니다. 버전을 올릴 때는 `AXE_CDN` 의 버전도 함께 맞춥니다.
