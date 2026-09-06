# 003. Helldivers MCP 초기 서버 구성

- 작업일: 2026-09-06
- 작업 범위: API 참고 문서의 Markdown 전환, PDF 삭제, MCP TypeScript 초기 서버와 읽기 전용 도구 구성
- 기록 기준: 변경 파일, npm 설치 결과, TypeScript 검사와 실행 시도 결과

## 1. 작업 목적

Helldivers 2 API를 이후 지시에서 실제 사용할 수 있도록 자체 MCP 서버의 실행 기반을 만든다. API 분석 결과는 PDF 대신 저장소 안의 Markdown으로 유지한다.

## 2. 수행한 작업과 선택 이유

- `docs/reference/helldivers2-api.md`를 API 기준 문서로 유지했다. 헤더 요구사항, 실제 `/api/v1/war` 검증, 전체 경로와 명세 한계를 포함한다.
- `mcp/`에 Node.js/TypeScript MCP 패키지를 추가했다. 로컬 AI 클라이언트가 프로세스를 실행할 수 있도록 stdio transport를 사용했다.
- `get_war`, `list_planets`, `get_planet`, `list_campaigns`, `list_assignments`, `list_dispatches`, `list_planet_events`, `list_space_stations`, `list_steam_news`를 읽기 전용 도구로 등록했다.
- 공통 API 클라이언트에서 `X-Super-Client`와 빈 `X-Super-Contact`를 항상 전송하도록 했다. 임의 URL 도구나 쓰기 기능은 추가하지 않았다.
- 사용자 요청에 따라 `output/pdf/helldivers2-api-guide-ko.pdf`를 삭제했다. 내용은 Markdown에 보존했다.
- `AGENTS.md`와 `docs/task_specs/002_Helldivers_MCP_서버.md`를 추가해 향후 구현 기준과 검증 경계를 고정했다.

## 3. 발생한 문제와 해결 과정

### 문제 A. MCP 프로세스 실행 시 Node 메모리 오류

**증상:** `npm run start`가 MCP 초기화 전에 `uv_os_get_passwd returned ENOMEM`으로 종료됐다.

**조사와 근거:** 같은 패키지에서 `npm run typecheck`는 성공했다. 오류 스택은 `tsx`의 임시 디렉터리 초기화 중 Node `os.userInfo` 호출에 위치한다.

**원인:** 현재 실행 환경의 Node 프로세스가 시스템 사용자 정보를 읽는 단계에서 메모리 오류를 반환한 것으로 확인했다. MCP 코드 오류로 확정할 근거는 없다.

**해결:** 실행 결과를 실패로 숨기지 않고 작업 기록에 남겼다. 프로토콜 호출 검증은 이 환경 오류가 해소된 뒤 수행한다.

## 4. 검증 결과와 남은 확인

| 항목 | 방법·환경 | 결과 및 한계 |
| --- | --- | --- |
| 의존성 설치 | `mcp/npm install` | 성공, 취약점 0개 |
| TypeScript | `mcp/npm run typecheck` | 성공 |
| MCP stdio 시작 | `mcp/npm run start` | Node `uv_os_get_passwd ENOMEM`으로 시작 전 종료 |
| 실제 API | 이전 작업의 curl `/api/v1/war` | 두 헤더로 200 성공. 이번 MCP 도구 경유 호출은 미검증 |
| PDF 삭제 | 명시적 경로 확인 후 삭제 | 완료, Markdown 기준 문서 유지 |

남은 확인은 MCP 클라이언트의 `initialize`, `tools/list`, `tools/call`, 실제 도구별 API 응답, 429·타임아웃·캐시 정책이다. 현재 초기 구현에는 캐시와 재시도 상한이 아직 들어가지 않았다.

## 5. 이번 작업에서 얻은 점

API 명세의 v1/v2와 MCP SDK 버전은 서로 무관하므로 각각 고정하고 검증해야 한다. 실행 전 프로토콜 테스트가 가능한 환경을 준비하고, 도구 응답에 원본 경로와 수신 시각을 함께 제공하는 계약을 유지한다.

## 6. 주요 변경 파일

- `mcp/package.json`: MCP SDK와 실행·검사 스크립트
- `mcp/src/api-client.ts`: Helldivers API 호출과 헤더
- `mcp/src/server.ts`: 읽기 전용 도구 등록
- `mcp/src/index.ts`: stdio 서버 시작
- `docs/reference/helldivers2-api.md`: API 기준 문서
- `docs/task_specs/002_Helldivers_MCP_서버.md`: 구현 기준
- `AGENTS.md`: 작업 시 우선 읽을 문서

## 7. 참고 자료

- [Helldivers API README](https://helldivers-2.github.io/api/README.md)
- [Helldivers OpenAPI](https://helldivers-2.github.io/api/openapi/Helldivers-2-API.json)
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/)
