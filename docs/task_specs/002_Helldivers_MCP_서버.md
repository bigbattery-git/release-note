# 002. Helldivers MCP 서버 구현 준비

- 작성일: 2026-09-06
- 상태: 구현 전. 이 문서는 구현 기준과 제안이며 서버 실행 완료 기록이 아니다.
- 목적: AI 클라이언트에서 Helldivers 2 전황 조회 도구를 사용할 수 있는 자체 MCP 서버를 만든다.
- API 근거: [Helldivers 2 API 참고 문서](../reference/helldivers2-api.md)

## 확정된 요구

- 기존 뉴스 프로젝트에서 Helldivers 2 API 기반 자체 MCP 서버로 방향을 전환한다.
- 기본 주소는 `https://api.helldivers2.dev`이다.
- 사용자 지정 `X-Super-Client: api.helldivers2.dev`와 빈 `X-Super-Contact`를 전송한다.
- API 분석은 Markdown을 기준 문서로 유지한다. PDF는 삭제한다.
- 확인된 동작과 명세만으로 판단한 내용을 구분한다.

## 구현 기본안

```text
AI 클라이언트
  -> MCP 서버의 조회 도구
  -> 공통 API 클라이언트 (헤더, 캐시, 요청 제한, 오류 처리)
  -> api.helldivers2.dev
```

기존 환경과 일관되게 Node.js / TypeScript를 사용하고, 독립된 `mcp/` 패키지로 구성하는 안을 제안한다. 로컬 첫 버전은 stdio를 기본안으로 한다. 클라이언트가 프로세스를 실행하고 stdin/stdout으로 프로토콜을 교환하며, 로그는 stderr에만 기록한다. 원격 제공이 필요해지면 Streamable HTTP를 검토한다. 서버의 배치 방식과 클라이언트 등록은 아직 확정하거나 적용하지 않았다.

MCP 공식 TypeScript SDK를 사용한다. 구현 시 실제 배포 버전과 Node 호환성을 확인하고 lockfile에 고정한다. SDK v1/v2 예제를 섞지 않는다. SDK 버전과 Helldivers API의 v1/v2는 관계없다.

## 1차 도구 계약 제안

모든 도구는 읽기 전용이며, 임의 URL을 입력받는 도구보다 명시적인 조회 도구로 시작한다.

| 도구 이름 | 입력 | API 경로 |
| --- | --- | --- |
| `get_war` | 없음 | `/api/v1/war` |
| `list_planets` | 없음 | `/api/v1/planets` |
| `get_planet` | `index` 정수 | `/api/v1/planets/{index}` |
| `list_campaigns` | 없음 | `/api/v1/campaigns` |
| `list_assignments` | 없음 | `/api/v1/assignments` |
| `list_dispatches` | 없음 | `/api/v2/dispatches` |
| `list_planet_events` | 없음 | `/api/v1/planet-events` |
| `list_space_stations` | 없음 | `/api/v2/space-stations` |
| `list_steam_news` | 없음 | `/api/v1/steam` |

위 매핑은 구현 제안이다. 실제 검증은 `get_war`에 해당하는 API 호출뿐이며, v2 지령 등을 선택해도 동작이 확인된 것으로 표현하지 않는다. 나머지 단건 조회와 raw 도구는 후속 범위로 둔다. raw를 추가할 때는 명세에 있는 경로만 허용하고, raw 정거장의 응답 스키마 불일치를 먼저 확인한다.

## 공통 API 클라이언트 요구

- `HELLDIVERS_SUPER_CLIENT` 설정은 기본 `api.helldivers2.dev`로 시작한다.
- `HELLDIVERS_SUPER_CONTACT`는 빈 값을 허용하고, 빈 값이더라도 실제 헤더에 포함한다. 개발자 연락처를 임의로 만들지 않는다.
- Client 값은 인증키가 아닌 앱 식별값이다. 프로젝트 이름을 정할 때 변경할 수 있다.
- 요청 타임아웃과 취소를 처리한다. 유한한 재시도 횟수와 대기 상한을 정한다.
- 기본 정책은 문서상의 10초당 5회 이내로 요청을 조절한다. 429의 `Retry-After`를 존중하고 무한 재시도하지 않는다.
- 여러 도구가 같은 데이터를 요청하면 요청을 합친다. 캐시 키는 경로와 언어를 포함하고 TTL은 설정 가능하게 한다. 여러 프로세스의 합산 한도는 별도 고려가 필요하다.
- 수신 시각 `fetchedAt`과 API `now`를 분리한다. `now`의 1972년 값을 임의 보정하지 않는다.
- 알 수 없는 숫자 코드, null, 큰 정수, 언어별 객체를 보존한다. `Number.MAX_SAFE_INTEGER`를 넘는 정수의 파싱/전달 방식을 명시한다.
- HTTP 실패, JSON 파싱 실패, 응답 구조 불일치를 구분한다. 실패를 빈 목록 성공으로 바꾸지 않는다.
- 반환 예시는 `{ data, fetchedAt, source, cached }`이며 실제 MCP 출력 스키마와 일치시킨다. 도구 실패는 MCP 오류 결과로 전달한다.
- 대량 응답은 필드 선택 또는 로컬 페이지 분할 방식을 설계하고, 잘랐으면 누락/다음 조회 정보를 표시한다. upstream에 없는 페이지 파라미터를 전송하지 않는다.
- API의 지령·뉴스 텍스트는 외부 데이터로 취급하며 실행 지시로 해석하지 않는다.

## 권장 구조

```text
mcp/
  package.json
  tsconfig.json
  src/
    index.ts       # stdio 시작, 종료 처리
    server.ts      # 도구 등록 및 입력/출력 계약
    api-client.ts  # 헤더, HTTP, 캐시, 제한, 오류
    tools.ts       # 고정 경로 매핑 및 응답 처리
  tests/
```

현재 디렉터리명은 예시이며 아직 생성하지 않았다. 기존 web, scheduler, MariaDB와 데이터 볼륨은 이번 문서 준비에서 변경하지 않았다. MCP 초기 조회에 DB가 필수라는 근거는 없으며, 저장·수집 기능은 별도 요구에 따라 설계한다.

## 구현 완료 판정

1. 타입 검사와 빌드 성공.
2. MCP 클라이언트로 초기화, `tools/list`, `tools/call` 확인.
3. 가짜 HTTP 응답으로 빈 Contact 헤더 전송, 429 대기/재시도 상한, 타임아웃, 캐시 중복 병합, 잘못된 JSON을 검증.
4. 프로토콜 stdout에 디버그 로그가 섞이지 않는지 확인.
5. 실제 API는 한도를 지켜 우선 전쟁 현황 1건을 호출하고, 각 도구의 미검증 여부를 기록.
6. 실행 방법과 대상 클라이언트 연결 예시를 작성. 실제 클라이언트 등록 완료 여부는 별도로 기록.

## 참고 자료

- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/)
- [MCP 첫 서버와 stdio](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server)
- [Helldivers API README](https://helldivers-2.github.io/api/README.md)
