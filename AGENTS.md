# 프로젝트 작업 기준

현재 방향은 Helldivers 2 API를 제공하는 자체 MCP 서버다. 기존 뉴스 개발 환경 파일은 남아 있으나 현재 기능 요구로 자동 해석하지 않는다.

Helldivers API 또는 MCP 관련 작업을 시작할 때 다음 문서를 읽는다.

1. `docs/reference/helldivers2-api.md`: API 구조, 실제 헤더 검증, 명세의 한계와 출처.
2. `docs/task_specs/002_Helldivers_MCP_서버.md`: 확정 요구와 구현 기본안. 제안과 구현 완료를 구분한다.
3. `docs/rules/work_log.md`: 작업 완료 후 수행 기록 작성 규칙.

사용자의 최신 지시가 우선이다. 과거 API 스냅샷을 현재 값으로 설명하지 않으며, 테스트하지 않은 도구를 검증 완료로 기록하지 않는다. 구현 과정에서 확인된 계약 변경은 관련 Markdown에 반영한다.
