# 008. 기술별 Release 이력 조회

- 작업일: 2026-09-13
- 작업 범위: Release 이력 보존 확인, technology별 최신·목록·상세 조회, 최근 7일 표시, 수집 결과 UI 단순화와 조회 index 추가
- 기록 기준: Task Spec `docs/task_specs/006_기술별_Release_이력_목록_상세_조회.md`, 최종 변경 파일, 로컬 MariaDB와 Chrome 검증 결과

## 1. 작업 목적

기술별로 새 GitHub Release가 저장된 뒤에도 이전 Release와 요약을 계속 조회할 수 있게 한다.
메인 페이지에는 technology별 최신 저장 Release 한 건만 보여주고, technology를 선택하면 이력 목록,
Release를 선택하면 저장된 `summary` 상세로 이동하는 흐름을 만든다.

반복 수집하면 대부분 `skipped`가 되는 신규 저장·정보 갱신·변경 없음 집계 영역은 제거한다.
별도 상태 column을 추가하지 않고 `created_at`이 현재 DB 시각 기준 7일 이내인 최신 카드에
빨간 점을 표시해 최근 Release라는 정보만 전달한다.

## 2. 수행한 작업과 선택 이유

### 2.1 저장 정책 확인

- 기존 `technology_releases`의 `(technology, external_id)` unique constraint를 유지했다.
- 기존 수집 로직은 새로운 `external_id`를 새 행으로 `INSERT`하고 있으므로 서로 다른 Release의
  이전 행을 덮어쓰지 않는다는 점을 확인했다.
- 동일 GitHub Release가 사후 편집되면 같은 행을 `UPDATE`하고, 동일 내용이면 DB write를 하지 않는
  기존 정책을 유지했다. 매 수집마다 동일 Release를 새 행으로 넣는 append-only snapshot은 중복
  데이터를 만들기 때문에 적용하지 않았다.

### 2.2 최신·이력·상세 조회

- `web/lib/releases/history.ts`에 다음 읽기 전용 조회 책임을 모았다.
  - 활성 technology별 최신 Release 한 건 조회
  - technology별 Release 목록 조회
  - DB primary key 기준 Release 상세 조회
  - page 입력 검증과 최근 7일 판정
- 최신과 목록 정렬은 사용자 요청대로 `created_at DESC, id DESC`를 사용했다.
- 목록은 `page size 20`의 offset pagination으로 구현했다. 전체 행 수를 위한 `COUNT(*)` query를
  추가하지 않고 21건을 조회한 뒤 20건만 표시해 `다음` page 존재 여부를 판정한다.
- URL 구조는 자원 종류가 충돌하지 않도록 다음과 같이 확정했다.
  - `/`: technology별 최신 Release
  - `/technologies/[technology]`: technology별 Release 이력
  - `/releases/[releaseId]`: Release 상세와 저장된 `summary`
- 존재하지 않는 technology, 잘못된 page와 Release ID는 공통 404 화면으로 처리하고, DB 조회 오류는
  내부 정보를 노출하지 않는 공통 오류 화면으로 처리했다.

### 2.3 최근 7일 표시

- 최근 여부를 위한 DB column이나 상태 table은 추가하지 않았다.
- 각 최신 Release query에서 `CURRENT_TIMESTAMP(3)`을 함께 가져와 `created_at`과 동일한 DB timezone
  기준으로 비교했다.
- `created_at <= 현재 DB 시각 <= created_at + 7일`이면 최근 Release로 판정하고, 미래 시각이나
  7일이 지난 값은 제외했다.
- 메인 최신 카드에 빨간 점을 표시하고 `최근 7일 내 저장된 Release`라는 접근 가능한 이름을 제공했다.

### 2.4 수집 결과 단순화

- 공개 수집 성공 응답에서 `items`, `inserted`, `updated`, `skipped`, `summaryFailed`를 제거하고
  요약 실패에 필요한 `warnings`만 남겼다.
- 수집 결과의 세 개 숫자 카드, technology별 결과 카드와 상태 badge를 제거했다.
- 수집 중에는 버튼 상태를 표시하고, 정상 완료 후에는 짧은 완료 문구를 보여준 뒤
  `router.refresh()`로 DB 기반 최신 카드를 다시 조회한다.
- 요약 일부 실패는 건수 없이 일반 경고로 표시하며 Release 저장 성공과 분리하는 기존 정책은 유지했다.

### 2.5 DB index

- 공식 Kysely CLI의 `npx.cmd kysely migrate make add_technology_release_history_index --no-outdated-check`
  명령으로 timestamp migration을 생성했다.
- `technology_releases(technology, created_at, id)` 복합 index를 추가했다.
- 기존 `(technology, external_id)` unique constraint와 foreign key는 변경하지 않았다.
- 새 migration을 로컬 MariaDB에 실제 적용했다.

## 3. 발생한 문제와 해결 과정

### 문제 A. Docker CLI를 사용할 수 없음

**증상:** `docker compose ps` 실행 시 `docker` 명령을 찾을 수 없다는 PowerShell 오류가 발생했다.

**조사와 근거:** 애플리케이션 build나 MariaDB 연결 오류가 아니라 현재 shell에서 Docker CLI 자체를
찾지 못했다. 반면 `web/.env`를 사용하는 Kysely migration과 로컬 MariaDB query는 정상 실행됐다.

**원인:** 현재 실행 환경의 PATH에서 Docker CLI를 사용할 수 없다.

**해결:** Docker Compose 검증을 성공으로 간주하지 않고, 로컬 Next.js·MariaDB 환경에서 migration,
index, query와 화면을 검증했다.

**재검증:** Docker Compose는 미검증으로 남겼다. 후속 검증에는 Docker CLI를 사용할 수 있는 환경이 필요하다.

### 문제 B. PowerShell inline Node.js 검증 명령의 따옴표 손실

**증상:** `node --eval`에 작성한 `SHOW INDEX` query의 따옴표가 PowerShell 전달 과정에서 손실되어
JavaScript syntax error가 두 차례 발생했다. 두 실행 모두 DB query 전에 종료됐다.

**원인:** PowerShell, Node.js `--eval`과 SQL 문자열의 중첩 인용이 올바르게 전달되지 않았다.

**해결:** 식별 가능한 임시 검증 script를 `web/scripts/`에 작성해 index·실행 계획과 pagination을
검증하고, 실행이 끝난 뒤 해당 script를 제거했다.

**재검증:** `SHOW INDEX`, `EXPLAIN`과 임시 Release 21건 기반 pagination 검증이 통과했다.
임시 Release는 `finally`에서 해당 검증 prefix와 일치하는 행만 제거했고 검증 script도 최종 변경에 남기지 않았다.

### 문제 C. 기존 개발 서버와 포트 중복

**증상:** `npm.cmd run dev`를 새로 실행하자 이미 같은 project의 Next.js 개발 서버가 동작 중이며
3001번 포트를 사용하고 있다는 메시지와 함께 새 process가 종료됐다.

**원인:** 기존 개발 서버 process가 이미 실행 중이었다.

**해결:** 기존 process를 강제 종료하거나 새 process를 추가하지 않고, 안내된 `http://localhost:3001`을
브라우저 검증에 사용했다.

**재검증:** 기존 서버의 Fast Refresh로 최종 화면이 반영됐고 새 브라우저 문맥에서 console error가 없었다.

## 4. 검증 결과와 남은 확인

| 항목 | 방법·환경 | 결과 및 한계 |
| --- | --- | --- |
| 변경 전 회귀 기준 | `npm.cmd test` in `web` | 기존 14개 test 통과 |
| 최종 unit test | `npm.cmd test` in `web` | 최근 7일 경계와 page 검증을 포함한 17개 통과, 실패 0 |
| TypeScript | `npm.cmd run typecheck` in `web` | 통과, 새 동적 route type 생성 성공 |
| production build | `npm.cmd run build` in `web` | 성공, `/`, `/technologies/[technology]`, `/releases/[releaseId]` dynamic route 확인 |
| migration 생성 | `npx.cmd kysely migrate make add_technology_release_history_index --no-outdated-check` | `1789275582458_add_technology_release_history_index.ts` 생성 |
| migration 적용 | `npm.cmd run db:migrate` in `web` | 새 index migration `Success`, 전체 migration 완료 상태 확인 |
| index 구조 | 로컬 MariaDB `SHOW INDEX` | unique constraint 유지, `technology`, `created_at`, `id` 순서의 새 BTREE index 확인 |
| 목록 실행 계획 | 로컬 MariaDB `EXPLAIN` | `idx_technology_releases_history` 선택 확인 |
| offset pagination | 로컬 MariaDB에 식별 가능한 임시 Release 21건 추가 후 실제 조회 함수 호출 | 첫 page 20건, `hasNext = true`, 두 번째 page 존재와 page 간 ID 중복 없음 확인 후 임시 행 제거 |
| 최근 7일 | unit test와 실제 최신 조회 | 저장 직후와 정확히 7일 경계 포함, 7일 초과와 미래 값 제외 확인 |
| 메인 화면 | Chrome `http://localhost:3001` | technology별 최신 카드 3개, 최근 빨간 점과 접근 가능한 이름, 집계·상태 카드 제거 확인 |
| 이력 목록 | Chrome `/technologies/nextjs` | Next.js Release 목록, 요약 여부, 발행·저장일과 상세 링크 확인 |
| Release 상세 | Chrome `/releases/1` | 저장된 한글 `summary`, 공식 Release 링크와 목록 복귀 링크 확인 |
| not-found | Chrome `/technologies/unknown` | 공통 404 화면 확인 |
| browser console | 새 Chrome 검증 tab | error·warning 없음 |
| diff 검사 | `git diff --check` 및 새 파일 trailing whitespace 검사 | 오류 없음. Git의 LF→CRLF 안내만 출력됨 |
| lint | `web/package.json` script 확인 | lint script가 없어 실행하지 않음 |
| Docker Compose | `docker compose ps` | Docker CLI 부재로 미검증 |

현재 DB에는 실제 technology별 Release가 한 건씩만 존재한다. 실제 GitHub에 새로운 Release가 발생한
상태에서 수집 버튼을 실행해 이전 행과 새 행이 함께 보이는 end-to-end 흐름은 이번 작업에서 재현하지 않았다.
서로 다른 Release 행과 offset pagination은 임시 데이터와 실제 조회 함수로 검증했다.

20건을 초과하는 이력의 `이전`·`다음` 동작은 DB query 수준에서 확인했지만 브라우저 화면에서는
실데이터로 검수하지 않았다. 또한 이번 브라우저 검수에서는 외부 GitHub/OpenAI 호출과 DB write를
발생시키는 수집 버튼을 다시 실행하지 않았으므로, `router.refresh()` 이후 카드 갱신은 코드·typecheck·build
근거까지만 확보했다.

## 5. 이번 작업에서 얻은 점

- 새 Release의 이력과 동일 Release의 사후 편집 이력은 서로 다른 문제다. 현재 요구사항은
  `(technology, external_id)`를 논리 Release 식별자로 유지하는 것으로 충족할 수 있다.
- 데이터 변경 빈도가 낮고 전체 page 수가 필요하지 않다면 offset pagination에서 1건을 더 조회하는 방식이
  별도 `COUNT(*)` 없이 단순한 `이전`·`다음` UI를 제공한다.
- 최근 여부처럼 현재 시각으로 다시 계산할 수 있는 값은 DB column으로 저장하지 않아야 schema와 갱신
  로직을 늘리지 않을 수 있다.
- MariaDB의 `DATETIME`과 애플리케이션 시각 비교에서는 DB의 `CURRENT_TIMESTAMP(3)`을 함께 조회하면
  host와 container의 timezone 차이로 인한 오판 가능성을 줄일 수 있다.
- 읽기 화면을 Server Component와 Kysely query로 연결하면 별도 GET API 계층 없이 secret과 DB 연결을
  server에 유지할 수 있다.

## 6. 주요 변경 파일

- `docs/task_specs/006_기술별_Release_이력_목록_상세_조회.md`: 승인된 저장 정책, route, pagination, index와 단순화 원칙
- `web/migrations/1789275582458_add_technology_release_history_index.ts`: technology별 최신·이력 조회 index
- `web/lib/releases/history.ts`: 최신·목록·상세 query, page 검증과 최근 7일 판정
- `web/lib/releases/history.test.ts`: 최근 7일 경계와 page 입력 unit test
- `web/lib/releases/service.ts`: 집계 제거와 요약 실패 warning 중심 수집 결과
- `web/lib/releases/types.ts`: 단순화된 수집 API 응답 type
- `web/lib/releases/service.test.ts`: 단순화된 요약 warning 동작 검증
- `web/app/page.tsx`: DB 기반 technology별 최신 카드와 최근 빨간 점
- `web/app/release-test-panel.tsx`: 집계·상태 카드 제거, 완료·경고와 `router.refresh()`
- `web/app/technologies/[technology]/page.tsx`: technology별 offset pagination 이력 목록
- `web/app/releases/[releaseId]/page.tsx`: Release 상세와 저장된 `summary`
- `web/app/not-found.tsx`, `web/app/error.tsx`: 안전한 404와 조회 오류 화면

## 7. 참고 자료

- [Task Spec 006](../task_specs/006_기술별_Release_이력_목록_상세_조회.md)
- [Work Log 작성 규칙](../rules/work_log.md)
