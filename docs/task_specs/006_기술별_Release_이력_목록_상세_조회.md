# 006. 기술별 Release 이력 저장·목록·상세 조회

- 작성일: 2026-09-13
- 기준: 저장된 Release를 기술별 이력으로 유지하고 최신·목록·상세 화면에서 조회하기 위한 사전 Task Spec
- 관련 문서: `docs/task_specs/003_테스트_버튼_최신_기술_Release_저장.md`, `docs/task_specs/004_Kysely_migration_전환.md`, `docs/task_specs/005_OpenAI_Release_요약_한글화_출력.md`
- 상태: 구현 및 로컬 검증 부분 완료 (`Docker Compose`, 20건 초과 browser pagination 검증 제외)

## 1. 목표 (Goal)

기술별로 새 GitHub Release가 수집될 때 기존 Release 행을 덮어쓰지 않고 새 행으로 저장해
Release 이력을 유지한다. 메인 페이지에는 각 technology의 가장 최근 저장 Release 한 건만 보여주고,
사용자가 technology를 선택하면 해당 technology의 이전 Release 목록을, 목록의 Release를 선택하면
그 Release에 저장된 `summary`를 확인할 수 있게 한다.

신규 저장·정보 갱신·변경 없음의 건수 집계는 화면과 공개 응답에서 제거한다. 대신 Release의
`created_at`이 현재 시각 기준 7일 이내이면 빨간 점과 접근 가능한 안내 문구로 최근 Release임을 표시한다.

## 2. 배경

- `technology_releases`는 Release 한 건을 `(technology, external_id)`로 식별하며 이 조합에 unique constraint가 있다.
- 현재 수집 로직은 GitHub에서 technology별 최신 안정 Release 한 건을 가져온다.
- 새로운 `external_id`이면 `INSERT`, 기존 `external_id`와 내용이 같으면 `skipped`, 같은 `external_id`의 metadata나 원문이 바뀌면 해당 행을 `UPDATE`한다.
- 따라서 서로 다른 Release가 차례로 수집되면 현재 schema와 저장 로직도 이전 Release 행을 보존한다. 현재 `UPDATE`는 이전 버전을 최신 버전으로 교체하는 동작이 아니라, GitHub에서 동일 Release를 사후 편집했을 때 같은 논리 Release를 갱신하는 동작이다.
- 현재 메인 페이지는 `POST /api/releases/collect`의 직전 실행 결과만 client state로 보여준다. DB에 저장된 최신 Release나 과거 Release를 다시 조회하는 API·화면은 없다.
- 현재 수집 결과는 `inserted`, `updated`, `skipped` 건수를 계산해 화면의 세 개 집계 카드로 표시한다.
- 현재 수집은 실행 시점의 최신 Release 한 건만 가져오므로, 이 기능을 구현해도 과거 GitHub Release 전체가 자동으로 소급 저장되지는 않는다.

## 3. 요구사항 (Requirements)

### 3.1 Release 저장 정책

- technology별로 기존 행과 다른 `external_id`의 Release가 수집되면 반드시 새 행으로 `INSERT`한다.
- 새 Release를 저장할 때 같은 technology의 이전 Release 행과 해당 행의 `description`, `summary`, URL, 날짜를 변경하거나 삭제하지 않는다.
- 동일한 `(technology, external_id)`가 다시 수집되면 중복 행을 만들지 않는다.
- 같은 GitHub Release가 사후 편집된 경우에는 현재 행을 갱신하고, `description`이 변경되었을 때만 기존 `summary`를 무효화한 뒤 다시 생성하는 기존 정책을 유지한다.
- `(technology, external_id)` unique constraint를 유지해 동시·반복 수집에서도 같은 논리 Release의 중복 저장을 막는다.
- 저장 과정에서 필요한 `inserted`, `updated`, `skipped` 판정 자체는 중복 방지와 요약 처리 판단을 위해 내부 로직으로 유지한다.
- 수집 성공 응답의 전체 `inserted`, `updated`, `skipped` 숫자 필드는 제거하고 화면에서도 해당 건수 집계 카드를 제거한다.
- 공개 응답과 화면에서 기술별 `inserted`, `updated`, `skipped` 결과 카드와 badge도 제거한다.

### 3.2 최신 Release 조회

- 메인 페이지는 수집 API의 일회성 응답이 아니라 MariaDB에 저장된 데이터를 조회해 표시한다.
- 활성 `default_technologies` 각각에 대해 `technology`가 같은 Release 중 `created_at`이 가장 최근인 한 건만 반환한다.
- 같은 technology 안에서 `created_at`이 같으면 `id`가 큰 행을 최신으로 판정해 결과를 결정적으로 만든다.
- technology 표시 순서는 `default_technologies.sort_order`를 따른다.
- 최신 Release 결과에는 최소한 technology code, 표시명, Release `id`, version, title, `released_at`, `created_at`, `summary` 존재 여부를 포함한다.
- 저장된 Release가 없는 technology도 화면에서 구분할 수 있어야 하며 다른 technology의 정상 결과를 숨기지 않는다.

### 3.3 technology별 이전 Release 목록

- 사용자가 메인 페이지의 technology 또는 최신 Release 카드를 선택하면 `/technologies/[technology]`의 Release 목록으로 이동한다.
- 목록은 선택한 technology의 저장된 Release만 보여준다.
- 목록 정렬은 `created_at DESC, id DESC`로 고정한다.
- 각 목록 항목에는 최소한 version, title, `released_at`, `created_at`, 요약 존재 여부를 표시한다.
- 목록에서는 `summary` 전문을 펼쳐 보여주지 않는다.
- 목록은 `/technologies/[technology]?page=1` 형태의 offset pagination을 사용한다.
- page size는 20건이며 `created_at DESC, id DESC`로 정렬한 뒤 현재 page의 offset을 적용한다.
- 전체 개수 계산은 하지 않고 21건을 조회해 20건만 표시하며, 21번째 행의 존재 여부로 `다음` 버튼을 결정한다.
- `page > 1`이면 `이전` 버튼을 제공한다.
- 존재하지 않거나 비활성인 technology를 요청하면 정상 목록으로 위장하지 않고 찾을 수 없는 상태를 반환한다.

### 3.4 Release 상세와 요약

- 사용자가 목록의 Release를 선택하면 `/releases/[releaseId]` 상세 화면으로 이동한다.
- 상세 조회는 전체에서 유일한 DB primary key `id`를 사용한다.
- 상세 DB 행의 technology를 사용해 `/technologies/[technology]` 목록으로 돌아가는 링크를 제공한다.
- 상세 화면에는 표시명, version, title, `released_at`, `created_at`, 저장된 `summary`와 공식 원문 링크를 표시한다.
- `summary`가 있으면 저장된 내용을 줄바꿈과 bullet 구조를 유지해 표시한다.
- `summary`가 `NULL`이면 빈 화면 대신 요약 미생성 또는 원문 없음 상태를 표시한다.
- 상세 조회만으로 OpenAI API를 다시 호출하거나 `summary`를 변경하지 않는다.
- 존재하지 않는 Release는 찾을 수 없는 상태를 반환한다.

### 3.5 수집 화면과 조회 화면의 연결

- 기존 `최신 Release 저장 테스트` 버튼과 수집 진행·성공·부분 실패·오류 표시는 유지한다.
- 신규 저장·정보 갱신·변경 없음의 개수를 보여주는 세 개 집계 카드는 표시하지 않는다.
- 수집 직후의 기술별 저장 결과 카드와 `inserted`, `updated`, `skipped` badge도 표시하지 않는다.
- 정상 완료 시 짧은 완료 문구만 표시하고, 요약 일부 실패 시 개수 없이 안전한 경고 문구를 표시한다.
- 수집이 성공하거나 Release 저장은 성공하고 요약만 실패한 경우, 메인 페이지의 DB 기반 최신 Release 목록을 다시 조회해 최신 상태를 반영한다.
- 페이지를 새로 열거나 새로고침해도 DB에 저장된 최신 Release와 이력을 다시 볼 수 있어야 한다.
- 목록 및 상세 화면에서 이전 화면으로 돌아갈 수 있는 명확한 탐색 수단을 제공한다.
- 모든 UI 디자인과 스타일링은 Tailwind CSS로 구현한다.

### 3.6 최근 Release 표시

- DB에 별도 최신 여부 column을 추가하지 않고 기존 `created_at`과 현재 server 시각으로 최근 여부를 계산한다.
- 판정식은 `created_at <= 현재 시각 <= created_at + 7일`로 한다. 예를 들어 09-13 10:00에 저장한 Release는 09-20 10:00까지 최근 Release로 표시하고 그 이후에는 표시하지 않는다.
- 미래 시각의 `created_at`은 최근 Release로 판정하지 않는다.
- 메인 페이지의 technology별 최신 Release 카드가 최근 조건을 만족하면 제목 또는 version 옆에 빨간 점을 표시한다.
- 빨간색만으로 의미를 전달하지 않도록 screen reader용 `최근 7일 내 저장된 Release` 문구 또는 동등한 접근 가능한 이름을 함께 제공한다.
- 빨간 점은 시간 경과에 따라 자동으로 사라지는 파생 UI 상태이며 DB 값을 변경하지 않는다.
- 브라우저 새로고침 또는 server 재조회 시 현재 시각을 기준으로 최근 여부를 다시 판정한다.

### 3.7 조회 경계와 오류 처리

- Release 목록·상세 조회는 server에서 MariaDB를 읽으며 client가 DB에 직접 접근하지 않는다.
- 조회 응답에는 DB 접속 정보, 환경 변수, 내부 stack, 원문 전체 등 화면에 필요하지 않은 정보를 포함하지 않는다.
- DB 조회 실패는 빈 목록이나 찾을 수 없음으로 위장하지 않고 안전한 오류 상태로 구분한다.
- pagination 입력, technology와 Release 식별자는 server에서 검증한다.
- 이 기능을 위해 새로운 library를 설치하지 않고 현재 Next.js, Kysely, React, Tailwind CSS 구성을 사용한다.

### 3.8 조회 성능과 DB 변경

- technology별 최신 한 건과 technology별 이력 정렬 조회가 전체 table scan에 의존하지 않도록 현재 index를 점검한다.
- `(technology, created_at, id)` 조회를 지원하는 index를 새 Kysely migration으로 추가한다.
- 기존 migration 파일은 수정하지 않고 `npx.cmd kysely migrate make <name> --no-outdated-check`로 새 timestamp migration을 생성한다.
- index 추가 여부와 관계없이 기존 `(technology, external_id)` unique constraint와 foreign key를 유지한다.

## 4. 완료 조건 (Acceptance Criteria)

### 사전 조건

- `web`과 MariaDB가 실행 가능하고 현재 Kysely migration이 적용되어 있다.
- 하나 이상의 technology에 서로 다른 `external_id`를 가진 Release가 2건 이상 준비되어 있다.

| 번호 | Acceptance Criteria |
| --- | --- |
| 1 | 같은 technology에 서로 다른 `external_id`의 Release를 순서대로 수집하면 두 행이 모두 존재하고 이전 행의 데이터와 `summary`가 유지된다. |
| 2 | 같은 `(technology, external_id)`를 변경 없이 다시 수집하면 행 수가 늘지 않고 DB write가 발생하지 않는다. |
| 3 | 같은 `external_id`의 `description`이 변경되면 새 Release 이력 행을 중복 생성하지 않고 해당 논리 Release의 metadata와 `summary` 재생성 정책이 기존대로 동작한다. |
| 4 | 메인 페이지를 처음 열거나 새로고침하면 DB 기준으로 활성 technology별 최신 Release 한 건이 표시된다. |
| 5 | 같은 technology에 여러 행이 있을 때 `created_at DESC, id DESC`의 첫 행만 메인 페이지에 표시된다. |
| 6 | Release가 없는 활성 technology는 데이터 없음 상태로 표시되고 다른 technology의 최신 결과는 정상적으로 표시된다. |
| 7 | technology를 선택하면 `/technologies/[technology]?page=1`에서 해당 technology의 Release만 `created_at DESC, id DESC` 순서로 최대 20건 표시된다. |
| 8 | Release가 20건을 넘는 경우 offset 방식의 `이전`·`다음` page를 조회해 나머지 항목을 볼 수 있고 전체 개수용 별도 query는 실행하지 않는다. |
| 9 | Release 목록에는 version, title, `released_at`, `created_at`, 요약 존재 여부가 보이고 `summary` 전문은 표시되지 않는다. |
| 10 | 목록의 Release를 선택하면 `/releases/[releaseId]`에서 저장된 `summary`, 공식 원문 링크와 해당 technology 목록으로 돌아가는 링크를 볼 수 있다. |
| 11 | `summary = NULL`인 Release 상세는 빈 화면 대신 요약 미생성 또는 원문 없음 상태를 표시하며 OpenAI API를 호출하지 않는다. |
| 12 | 존재하지 않거나 비활성인 technology, 존재하지 않는 Release, DB 오류가 각각 정상 데이터와 구분되는 안전한 화면·응답으로 처리된다. |
| 13 | 수집 완료 후 메인 페이지의 최신 목록이 DB에서 다시 조회되어 새로 저장된 Release로 갱신된다. |
| 14 | 직접 URL 접근과 browser 새로고침에서도 최신·목록·상세 화면이 DB 데이터를 기준으로 동일하게 동작한다. |
| 15 | 조회 응답과 browser 화면에 DB credential, 환경 변수, 내부 stack과 불필요한 Release 원문 전체가 노출되지 않는다. |
| 16 | 수집 성공 응답과 화면에서 전체 `inserted`, `updated`, `skipped` 숫자, 집계 카드, 기술별 저장 결과 카드와 badge가 제거되지만 기존 저장·중복 방지·요약 처리는 유지된다. |
| 17 | `created_at`부터 정확히 7일이 되는 시각까지 메인 최신 Release 카드에 빨간 점과 접근 가능한 최근 Release 안내가 표시된다. |
| 18 | `created_at + 7일`이 지난 Release와 미래 시각의 `created_at`에는 빨간 점이 표시되지 않으며, 이 판정을 위한 새 DB column이나 write가 발생하지 않는다. |
| 19 | 관련 unit/integration test, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `git diff --check`가 통과한다. |
| 20 | 실제 MariaDB에 서로 다른 Release 2건 이상을 준비한 뒤 메인 → technology 이력 목록 → Release 상세 요약 흐름과 최근 Release 표시의 browser 수동 검수가 성공한다. |

## 5. 작업 범위에서 제외하는 항목 (Out of Scope)

- GitHub의 과거 Release 전체를 소급 수집하는 backfill
- 동일 GitHub Release의 편집 전·후 revision을 각각 별도 행으로 보관하는 감사 이력
- 기존 Release 삭제, 보존 기간 설정과 archive 정책
- 검색, 필터, 정렬 선택, 즐겨찾기와 technology 간 통합 Release feed
- 최근 Release 여부를 저장하는 별도 DB column 또는 별도 상태 table
- 7일 이외의 표시 기간을 사용자가 설정하는 기능
- 사용자 정의 Repository 등록·수정·삭제
- 인증·권한 분리, 관리자 전용 화면과 사용자별 상태
- scheduler 연결, 수집 주기 변경, queue, retry worker와 분산 lock
- `summary` 수동 재생성, 원문 전체 표시와 번역문 전환
- notification, 배포와 production 운영 설정

## 6. 제약사항

- 새 Release의 기준은 `external_id`가 기존 행과 다른 경우이며, 수집 실행 횟수마다 같은 최신 Release를 중복 저장하지 않는다.
- 최신·이력 정렬 기준은 사용자 요청대로 `created_at`을 사용하고, 동률일 때 `id`를 사용한다.
- `created_at`은 DB에 저장된 시각이므로 향후 backfill을 수행하면 실제 Release 최신순인 `released_at`과 순서가 달라질 수 있다.
- 최근 Release 표시는 `created_at`으로부터 7일 동안만 유지하며 별도 DB 상태로 저장하지 않는다.
- 기존 Next.js App Router, Kysely, MariaDB, React, Tailwind CSS 구성과 server/client 보안 경계를 유지한다.
- 새 library 설치, 아키텍처 변경, 파일 분할 또는 refactoring이 필요하면 변경 전에 이유, 대안과 영향 범위를 설명하고 사용자 승인을 받는다.
- DB index 추가는 schema 변경이므로 구현 전에 migration과 영향 범위를 확인하고 승인받는다.
- 구현 및 검증 결과는 별도 Work Log에 한글로 기록한다.

## 7. 확정 사항

### 7.1 현재 코드에서 확인된 사항

1. 현재 schema는 `(technology, external_id)`를 unique key로 사용하므로 서로 다른 Release를 여러 행으로 보관할 수 있다.
2. 현재 저장 로직은 새 `external_id`를 `INSERT`하고, 같은 `external_id`만 `UPDATE` 또는 `skipped` 처리한다.
3. 현재 UI는 DB 조회 결과가 아니라 마지막 수집 요청의 응답만 보여준다.
4. 현재 별도 Release 목록·상세 조회 route와 API는 없다.
5. 현재 `ICollectionResult`와 화면은 `inserted`, `updated`, `skipped` 전체 건수를 계산하고 표시한다.

### 7.2 사용자 승인 사항

1. **저장 의미**: 새 Release마다 `INSERT`, 동일 Release의 사후 편집은 기존 행 `UPDATE`, 동일 내용은 DB write 없이 처리한다. 수집할 때마다 같은 Release까지 새 행으로 넣는 append-only snapshot은 적용하지 않는다.
2. **화면 구조**: 메인 `/`에는 technology별 최신 카드를 표시하고, `/technologies/[technology]`에는 해당 technology의 Release 목록, `/releases/[releaseId]`에는 DB primary key 기준 Release 상세를 표시한다. 기존 수집 버튼은 메인 페이지에 유지한다.
3. **pagination**: page size 20의 offset 방식을 사용한다. 전체 개수 query 없이 21건을 조회해 `다음` 존재 여부를 판정하고 `page > 1`이면 `이전`을 제공한다.
4. **index**: `(technology, created_at, id)` index를 새 Kysely migration으로 추가한다.
5. **단순화 원칙**: 공개 응답과 UI에서 전체 건수, 기술별 저장 결과 카드와 `inserted`, `updated`, `skipped` badge를 제거한다. 별도 상태 column은 추가하지 않으며, 수집 완료 후 DB 최신 카드를 재조회하고 `created_at` 기준 최근 7일인 카드에만 빨간 점을 표시한다.

## 8. 작업 루프 계획

각 반복은 연결된 Acceptance Criteria를 먼저 정하고, 해당 범위의 구현과 검증이 끝난 뒤 다음 단계로 이동한다.

1. **저장 회귀 기준 고정**: 새 `external_id`의 `INSERT`, 동일 `external_id`의 `skipped`·`UPDATE`, 이전 행 보존을 test로 고정하고 AC 1~3을 검증한다.
2. **조회 query와 index 점검**: technology별 최신 한 건, 이력 정렬, 상세 조회와 offset pagination query를 구현하고 실행 계획을 점검해 AC 4~8을 검증한다.
3. **server 조회 경계 구현**: 최신·목록·상세 응답 type, 입력 검증, not-found와 DB 오류 경계를 구현해 AC 6~12, 15를 검증한다.
4. **메인 최신 화면 연결**: 기존 수집 기능을 유지하면서 건수 집계를 제거하고 DB 기반 최신 카드와 최근 7일 표시를 연결한 뒤 수집 후 재조회해 AC 4~6, 13~14, 16~18을 검증한다.
5. **이력·상세 화면 구현**: technology 목록과 Release 상세 요약 탐색을 Tailwind CSS로 구현해 AC 7~11, 14를 검증한다.
6. **실데이터 수동 검수**: MariaDB의 복수 Release와 browser를 연결해 AC 13~18, 20을 검증한다.
7. **회귀·기록**: 전체 test, typecheck, build와 diff 검사를 수행해 AC 19를 확인하고 Acceptance Criteria별 근거와 제한을 Work Log에 기록한다.

각 반복이 실패하면 원인을 확인하고 같은 범위 안에서 승인된 수정만 수행한다. 통과한 조건과 남은 조건을 분리해 기록한 뒤 다음 단계 진행 여부를 결정한다.

## 9. 검증 방법

### 9.1 자동 검증

- 서로 다른 `external_id` 두 건을 저장해 두 행과 각각의 `summary`가 유지되는지 검증한다.
- 같은 `external_id`의 반복 입력, metadata 변경, `description` 변경에서 중복 방지와 기존 요약 정책을 검증한다.
- technology별 최신 한 건 선택 시 `created_at` 동률의 `id` tie-break를 검증한다.
- 고정된 현재 시각을 사용해 `created_at` 직후, 정확히 7일 경계, 7일 경과 후와 미래 `created_at`의 최근 여부를 검증한다.
- 수집 결과에서 전체 `inserted`, `updated`, `skipped` 숫자가 제거되어도 저장 판정과 요약 처리 test가 유지되는지 검증한다.
- technology 범위 제한, 20·21건 경계, 이전·다음 page, 마지막 page와 잘못된 page 입력을 검증한다.
- 상세 조회가 Release `id`로 정확한 행을 찾고 missing summary와 not-found를 구분하는지 검증한다.
- `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `git diff --check`를 `web` 또는 저장소의 올바른 working directory에서 실행한다.

### 9.2 DB·migration 검증

- `SHOW INDEX` 또는 `information_schema.statistics`로 unique constraint와 새 index 적용 여부를 확인한다.
- `EXPLAIN`으로 technology별 최신 조회와 이력 목록 조회의 index 사용 여부를 확인한다.
- 최신 migration을 재실행해 중복 적용이 없고 기존 Release 행과 요약이 유지되는지 확인한다.
- 기술별 복수 행을 query해 메인 최신 결과, 목록 순서와 상세 `summary`를 대조한다.

### 9.3 API·보안 검증

- 최신·목록·상세 정상 응답과 invalid input, not-found, DB 실패 응답을 확인한다.
- offset pagination 경계에서 항목 누락·중복이 없는지 응답의 `id` 집합을 비교한다.
- browser Network 응답에 DB credential, 환경 변수, 내부 stack과 필요하지 않은 `description` 전체가 없는지 확인한다.
- 상세 GET 요청만으로 DB write나 OpenAI API 호출이 발생하지 않는지 확인한다.

### 9.4 브라우저 수동 검수

- 메인 페이지 새로고침 시 technology별 최신 카드가 DB 데이터와 일치하는지 확인한다.
- 수집 버튼 실행 후 새 Release가 저장되면 최신 카드가 새 데이터로 바뀌고 이전 Release가 이력에 남는지 확인한다.
- 수집 결과 화면에 신규 저장·정보 갱신·변경 없음 집계 카드가 없는지 확인한다.
- 최근 7일인 최신 카드에는 빨간 점과 접근 가능한 안내가 보이고, 7일이 지난 카드에는 표시되지 않는지 확인한다.
- 메인 → technology 이력 목록 → Release 상세 → 이전 화면 복귀 흐름을 확인한다.
- Release 20건 초과 상태에서 다음 결과 탐색과 정렬을 확인한다.
- summary 있음·없음, Release 없음, not-found와 DB 오류 상태를 확인한다.
- desktop과 좁은 viewport에서 긴 title과 summary로 layout이 깨지지 않는지 확인한다.

## 10. 중지 조건

다음 중 하나에 해당하면 현재 반복을 중지하고, 통과·실패한 Acceptance Criteria, 확인한 원인과 필요한 결정을 보고한다.

- 같은 `external_id`까지 매 실행마다 중복 `INSERT`할지 여부처럼 저장 의미가 권장안과 다르게 결정된다.
- `created_at` 대신 `released_at`을 최신 기준으로 사용해야 하거나 과거 Release backfill이 요구된다.
- 최근 7일의 경계 또는 표시 위치가 명세와 다르게 결정된다.
- 승인되지 않은 새 library, architecture 변경, 파일 분할 또는 refactoring이 필요하다.
- DB index migration이 필요하지만 schema 변경 승인이 없다.
- MariaDB, browser 또는 필요한 외부 연동을 사용할 수 없어 실연동 검증을 진행할 수 없다.
- 동일 원인의 검증 실패가 수정 후 3회 연속 반복된다.
- 다음 변경이 이 Task Spec의 Out of Scope를 필요로 한다.
- 검증을 위해 기존 Release 삭제 등 복구하기 어려운 조치가 필요하지만 명시적 승인이 없다.

## 11. 완료 조건

다음 조건을 모두 만족할 때만 작업을 성공으로 종료한다.

- AC 1~20이 모두 통과하고 test, DB query·실행 계획, API 응답과 browser 확인 근거가 있다.
- 새 Release 저장 후 이전 Release 행과 기존 `summary`가 유지된다.
- 메인 최신 조회, technology별 이력 pagination과 Release 상세 요약 탐색을 직접 확인했다.
- 전체 저장 상태 건수 집계가 제거되고 `created_at` 기준 최근 7일 표시가 DB column 추가 없이 동작한다.
- 같은 논리 Release의 중복 행이 생기지 않고 기존 수집·요약·부분 실패 동작에 회귀가 없다.
- 조회만으로 DB write나 OpenAI API 호출이 발생하지 않는다.
- 실행하지 못한 검증은 성공으로 간주하지 않고 사유와 영향을 명시한다.
- 새 dependency, architecture 변경, 파일 분할과 Out of Scope 기능이 승인 없이 추가되지 않았다.
- 구현 내용, 문제·원인·해결, Acceptance Criteria별 결과와 남은 제한을 Work Log에 기록했다.
