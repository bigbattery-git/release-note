# 007. scheduler 1분 주기 Release 수집·요약 실행

- 작성일: 2026-09-13
- 기준: 기존 GitHub Release 수집·저장·OpenAI 요약 흐름을 `scheduler`에서 1분마다 안전하게 실행하기 위한 사전 Task Spec
- 관련 문서: `docs/task_specs/001_개발환경_구축.md`, `docs/task_specs/003_테스트_버튼_최신_기술_Release_저장.md`, `docs/task_specs/005_OpenAI_Release_요약_한글화_출력.md`
- 관련 작업 기록: `docs/work_logs/009_scheduler_1분_주기_Release_수집_요약.md`
- 상태: 구현 및 주요 로컬 검증 완료 (`Docker Compose`, 종료 signal handler 실동작과 일부 오류 응답 분기 제외한 부분 완료)

## 1. 목표 (Goal)

기존 `scheduler` service가 매분 한 번씩 이미 구현된 최신 GitHub Release 수집·저장·요약 흐름을 실행하게 한다.
직전 실행이 끝나지 않은 상태에서 다음 주기가 도착해도 같은 로직을 중복 실행하지 않으며,
동일한 Release를 반복 조회하더라도 중복 행이나 불필요한 OpenAI 요약이 생성되지 않아야 한다.
자동 실행으로 전환한 뒤에는 개발용 수동 수집 버튼과 관련 결과 UI를 제거한다.

## 2. 배경

- `scheduler/index.ts`에는 `node-cron`이 설치되어 있으나 현재 `* * * * * *`로 매초 실행되는 빈 callback만 등록되어 있다.
- 실제 Release 처리 흐름은 `web/app/api/releases/collect/route.ts`의 `POST` 요청이
  `web/lib/releases/service.ts`의 `collectLatestReleases()`를 호출하는 구조다.
- `collectLatestReleases()`는 활성 technology의 최신 안정 Release를 GitHub API에서 조회하고,
  DB 저장 후 `summary IS NULL`이며 요약 가능한 원문이 있는 행을 OpenAI API로 요약한다.
- `(technology, external_id)` unique constraint가 동일 Release의 중복 행 생성을 방지한다.
- `web`의 `activeCollection`은 한 Node.js 프로세스 안에서 겹친 수집 요청을 하나의 Promise로 병합하지만,
  별도 프로세스인 `scheduler`가 다음 cron tick에서 새 HTTP 요청을 시작하는 것 자체는 막지 않는다.
- 현재 `compose.yaml`은 `scheduler`와 `web`을 각각 한 instance씩 실행한다.

## 3. 요구사항 (Requirements)

### 3.1 1분 주기 실행

- 기존 `node-cron`을 유지하고 cron 표현식을 5-field `* * * * *`로 변경해 매분 한 번 실행한다.
- scheduler가 시작되었다는 이유만으로 cron tick 이전에 별도 즉시 실행을 추가하지 않는다.
- scheduler는 수집·저장·요약 로직을 자체적으로 복제하지 않고 기존 server 진입점을 호출한다.
- Docker Compose 내부에서는 `web` service 이름을 사용해 `POST /api/releases/collect`를 호출한다.
- 호출 대상 URL은 `RELEASE_COLLECTION_URL` 환경 변수로 전달해 Docker Compose 내부 주소와 로컬 검증 주소를 구분할 수 있어야 한다.
- 외부 API 조회, Release 비교, DB transaction과 OpenAI 요약 여부 판단은 기존 `web` service가 계속 담당한다.

### 3.2 실행 중복 방지

- scheduler process의 single-flight는 기존 `node-cron` 4.6의 `noOverlap: true`로 구현한다.
- cron tick이 도착했을 때 이전 scheduler 요청이 아직 진행 중이면 새 요청을 시작하지 않고 해당 tick을 건너뛴다.
- 진행 중인 작업의 성공, HTTP 실패, network 오류 또는 timeout이 확정되면 single-flight 상태를 반드시 해제해 이후 주기가 다시 실행될 수 있게 한다.
- scheduler가 시작한 요청과 별도의 API 요청이 겹치는 경우 기존 `collectLatestReleases()`의 `activeCollection` 병합 동작을 유지한다.
- 같은 `(technology, external_id)`를 다시 처리할 때 DB unique constraint와 기존 저장 로직을 유지해 중복 행을 만들지 않는다.
- 기존 `summary`가 non-null이고 `description`이 변경되지 않은 Release는 OpenAI API로 다시 요약하지 않는다.
- `summary IS NULL`이고 요약 가능한 `description`이 있는 Release는 다음 정상 실행에서 다시 요약을 시도할 수 있어야 한다.

### 3.3 응답과 실패 처리

- HTTP 2xx와 `success: true` 응답을 한 번의 scheduler 실행 성공으로 판정한다.
- HTTP non-2xx, `success: false`, 응답 형식 오류, network 오류와 timeout은 실패로 기록하며 성공으로 처리하지 않는다.
- 한 번의 실패 직후 별도 즉시 retry를 수행하지 않고 다음 cron tick에서 다시 시도한다.
- `web`이 아직 준비되지 않았거나 일시적으로 연결되지 않아도 scheduler process 자체는 종료하지 않고 다음 주기를 기다린다.
- scheduler 종료 시 기존 `SIGINT`, `SIGTERM` 처리와 cron task 정리를 유지한다.
- 종료 신호를 받은 뒤 새 실행을 시작하지 않으며, 진행 중 요청 처리 방침은 작업 전 확인 사항에서 확정한다.

### 3.4 timeout과 복구

- HTTP 요청 timeout은 `SCHEDULER_REQUEST_TIMEOUT_MS=300000`으로 설정해 5분 후 종료되게 한다.
- timeout은 환경 변수로 전달하고 Docker Compose에는 `300000`을 기본값으로 둔다.
- timeout 발생도 실패로 처리하고 single-flight 상태를 해제한다.
- 5분 timeout 동안 이전 요청이 진행 중이면 중간에 도착한 tick을 모두 건너뛰므로 동시 실행은 발생하지 않아야 한다.

### 3.5 운영 로그

- 최소한 scheduler 시작, 실행 시작, 실행 완료, 진행 중이라 건너뛴 tick, 실행 실패를 구분해 기록한다.
- 완료 로그에는 server가 반환한 안전한 경고가 있으면 포함하되 전체 Release 원문은 기록하지 않는다.
- 실패 로그에는 HTTP status 또는 안전한 오류 분류를 남기되 API key, request header, DB password,
  OpenAI 응답 원문, 내부 stack과 환경 변수 전체를 출력하지 않는다.
- 로그만으로 한 실행이 완료되기 전에 다음 요청이 시작되지 않았음을 시간 순서로 확인할 수 있어야 한다.

### 3.6 개발용 수동 실행 UI 제거와 현재 기능 회귀 방지

- `web/app/page.tsx`에서 개발용 `ReleaseTestPanel`을 제거한다.
- `ReleaseTestPanel`에서 제공하던 수동 수집 버튼, 실행 중 상태와 수집 결과 UI를 제거한다.
- 더 이상 참조되지 않는 `web/app/release-test-panel.tsx`는 삭제한다.
- `POST /api/releases/collect`는 scheduler가 호출하는 server 진입점이므로 제거하지 않는다.
- 메인 페이지의 technology별 최신 Release 목록, 상세 이동과 저장된 요약 조회 기능은 유지한다.
- 기존 최신 안정 Release 선택, `external_id` 기반 저장, metadata 갱신, 요약 생성·보존·재시도 규칙을 변경하지 않는다.
- scheduler 연결을 위해 새 외부 library를 설치하지 않고 Node.js의 기본 HTTP 기능과 이미 설치된 `node-cron`을 우선 사용한다.

### 3.7 학습 문서 작성

- 구현과 검증이 완료된 뒤 이번 scheduler 구조를 설명하는 새 문서를 `docs/study/`에 작성한다.
- 문서에는 scheduler가 기존 API를 `fetch`로 호출하도록 선택한 이유와 직접 import 방식과의 차이를 설명한다.
- process-local single-flight의 의미, 현재 단일 instance에서 보장하는 범위와 여러 process·container로 확장할 때의 한계를 설명한다.
- Laravel에서 한 요청 또는 한 worker의 memory 상태와 여러 worker가 공유하는 cache·DB lock을 구분하는 관점으로 비교해 설명한다.
- 5분 timeout, 겹친 tick 건너뛰기, 종료 신호 시 진행 중 요청 취소와 server-side 작업 지속 가능성을 현재 구현 파일에 연결해 설명한다.
- 문서에는 실제 구현·검증 결과만 기록하고 구현하지 않은 분산 lock을 현재 기능으로 표현하지 않는다.

## 4. 완료 조건 (Acceptance Criteria)

### 사전 조건

- `scheduler`, `web`, MariaDB를 실행할 수 있고 `web`이 필요한 GitHub·OpenAI·DB 환경 변수를 읽을 수 있다.
- 최신 DB migration이 적용되어 있으며 `default_technologies`에 활성 수집 대상이 존재한다.
- 실제 외부 API 연동 검증 시 GitHub와 OpenAI API에 접근할 수 있다.

| 번호 | Acceptance Criteria |
| --- | --- |
| 1 | scheduler의 cron 표현식이 `* * * * *`이며 정상 상태에서 분당 한 번만 수집 API 요청을 시작한다. |
| 2 | scheduler는 기존 `POST /api/releases/collect` 진입점을 호출하고 GitHub 조회·DB 저장·OpenAI 요약 로직을 별도로 복제하지 않는다. |
| 3 | 한 scheduler 실행을 의도적으로 60초보다 오래 유지했을 때 다음 tick은 건너뛰며 두 번째 HTTP 요청이 시작되지 않는다. |
| 4 | 진행 중 tick을 건너뛴 사실을 로그에서 구분할 수 있고, 이전 실행이 끝난 뒤 최초 다음 tick에서는 다시 요청이 시작된다. |
| 5 | 성공, HTTP 실패, network 오류와 timeout의 모든 종료 경로에서 실행 중 상태가 해제되어 scheduler가 다음 주기에 복구된다. |
| 6 | 메인 페이지에서 개발용 수동 수집 버튼과 관련 실행 상태·결과 UI가 제거되고, 최신 Release 목록과 상세 조회 기능은 유지된다. |
| 7 | 같은 최신 `external_id`를 여러 주기에서 다시 조회해도 `(technology, external_id)` 행 수가 증가하지 않는다. |
| 8 | 새 최신 `external_id`가 조회되면 해당 Release가 한 행 추가되고, 저장된 값이 GitHub 응답과 일치한다. |
| 9 | 기존 `summary`가 있고 `description`이 바뀌지 않은 Release는 반복 주기에서 OpenAI API를 다시 호출하지 않는다. |
| 10 | `summary IS NULL`이고 요약 가능한 `description`이 있는 Release는 정상 주기에서 요약을 시도하고 성공 결과를 같은 행에 저장한다. |
| 11 | `web` 미준비, HTTP non-2xx, `success: false`, 잘못된 응답, network 오류 또는 timeout이 성공 로그로 기록되지 않으며 scheduler process는 다음 tick까지 살아 있다. |
| 12 | scheduler log와 오류 처리 결과에 API key, DB password, request header, Release 원문 전체와 내부 stack이 노출되지 않는다. |
| 13 | `SIGINT` 또는 `SIGTERM`을 받으면 cron task를 정리하고 종료 신호 이후 새 실행을 시작하지 않는다. |
| 14 | `scheduler` typecheck와 기존 `web` test·typecheck·production build가 통과한다. |
| 15 | `docker compose up --build` 환경에서 `scheduler`, `web`, MariaDB가 정상 상태를 유지하고 실제 1분 주기 실행을 두 번 이상 관찰할 수 있다. |
| 16 | 구현 완료 후 `docs/study/` 문서에서 API 호출 방식, process-local single-flight, 단일 instance 보장 범위, timeout과 종료 동작을 현재 코드 기준으로 설명한다. |

## 5. 작업 범위에서 제외하는 항목 (Out of Scope)

- 여러 scheduler replica 또는 여러 web replica 사이의 분산 lock
- Redis, DB advisory lock, queue 또는 별도 worker orchestration 도입
- 초 단위, 사용자 지정 또는 관리자 화면 기반 스케줄 설정
- 실패 직후 자동 retry, exponential backoff와 dead-letter queue
- 과거 Release 전체 이력 backfill
- 새로운 Release 수집원, technology 등록·수정·삭제 기능
- GitHub webhook과 알림 발송
- 수집 API에 대한 인증·인가 추가
- 기존 Release 비교·저장·요약 정책 변경
- production 배포와 monitoring dashboard 구축

## 6. 제약사항

- 이번 중복 실행 방지 범위는 현재 Compose 구성인 단일 `scheduler` process와 단일 `web` process를 기준으로 한다.
- 반복 실행은 `node-cron`을 사용하며 `setInterval`, 재귀 `setTimeout` 또는 직접 작성한 무한 반복 loop를 추가하지 않는다.
- 새 library 설치가 필요하면 이유, 대안과 영향 범위를 설명하고 사용자 승인을 받은 뒤 진행한다.
- scheduler와 web의 연결 방식, 환경 변수 추가와 Compose 변경은 이 문서에서 승인된 범위 안에서만 수행한다.
- 기존 `web/lib/releases/service.ts`의 수집 책임을 scheduler로 옮기거나 복사하지 않는다.
- 개발용 `ReleaseTestPanel` 제거는 이번 요청으로 승인된 범위이며 다른 Release 조회 UI까지 함께 삭제하지 않는다.
- 파일 분할, 공용 package 추출 또는 대규모 refactoring이 필요하면 변경 전에 대상, 이유와 영향을 설명하고 별도 승인을 받는다.
- 실제 구현 및 검증 결과는 구현 완료 후 새 Work Log와 `docs/study/` 학습 문서에 각각 목적에 맞게 기록한다.

## 7. 확정 사항과 구현 전 확인 사항

1. **호출 방식 확정**: scheduler는 Node.js 기본 `fetch`로 기존 `POST /api/releases/collect`를 호출한다. scheduler가 `activeCollection`을 직접 import하는 구조가 아니다. `activeCollection`은 계속 `web/lib/releases/service.ts` 안에 존재하며, API Route가 호출하는 `collectLatestReleases()` 내부에서 같은 web process의 중복 실행을 병합한다. service code 직접 import 방식은 package 경계, dependency와 DB·OpenAI 환경 변수 구성을 함께 바꾸므로 사용하지 않는다.
2. **timeout 확정**: 기본값은 5분(`300000ms`)으로 한다. `SCHEDULER_REQUEST_TIMEOUT_MS` 환경 변수로 전달하며 Compose 기본값을 제공한다. `RELEASE_COLLECTION_URL`도 환경 변수로 전달하고 Compose 내부 기본값은 `http://web:3000/api/releases/collect`로 한다. 값은 repository에 secret으로 취급할 정보가 아니며, 필요할 때 루트 `.env` 또는 실행 환경에서 덮어쓸 수 있게 한다.
3. **종료 중인 요청 처리 확정**: 종료 신호를 받으면 cron task를 먼저 정리하고 진행 중인 scheduler HTTP 요청을 취소한 뒤 process를 종료한다. client 요청을 취소해도 이미 시작된 web의 server-side 수집이 계속될 수 있다는 점은 구현 완료 후 학습 문서에서 실제 코드 흐름과 함께 설명한다.
4. **중복 방지 범위 확정**: 이번 작업은 현재 Compose 구성인 scheduler 한 process와 web 한 process를 기준으로 한다. process-local single-flight는 실행 중 여부를 현재 Node.js process memory에 보관하는 방식이므로 다른 process나 container와는 상태를 공유하지 않는다. 여러 instance 사이의 중복 방지는 별도 분산 lock 작업으로 분리하며, 이 차이는 구현 완료 후 Laravel의 worker·cache lock 관점과 함께 학습 문서에 설명한다.

## 8. 작업 루프 계획

각 반복은 연결된 Acceptance Criteria를 먼저 정하고, 구현·검증·기록을 마친 뒤 다음 단계로 이동한다.

1. **scheduler 호출 경계 구성**: 수집 API URL과 timeout 설정을 읽고 한 번의 요청 결과를 성공·실패로 판정하는 동작을 구현한다. AC 2, 5, 11, 12를 검증한다.
2. **single-flight 적용**: 진행 중 요청이 있으면 tick을 건너뛰고 모든 종료 경로에서 상태를 해제한다. AC 3~5를 검증한다.
3. **cron과 종료 처리 연결**: `* * * * *` schedule, 운영 로그와 signal 처리를 연결한다. AC 1, 4, 13을 검증한다.
4. **Compose 연결**: scheduler가 Docker network에서 web을 찾을 수 있도록 환경 변수를 전달하고 시작 초기 실패 후 복구를 확인한다. AC 11, 15를 검증한다.
5. **개발용 UI 제거와 회귀 확인**: 수동 수집 panel을 제거하고 최신 Release 목록·상세 조회를 유지한다. 같은 Release 반복 실행과 요약 보존·재시도를 확인해 AC 6~10, 14를 검증한다.
6. **최종 실연동 검수**: 실제 Compose 환경에서 두 번 이상의 분 단위 실행과 DB·로그 결과를 확인하고 Acceptance Criteria별 근거를 Work Log에 기록한다.
7. **학습 문서 작성**: 최종 구현과 검증 결과를 기준으로 API 호출 경계, single-flight, timeout, 종료 처리와 다중 instance 한계를 `docs/study/`에 설명하고 AC 16을 검증한다.

각 반복에서 같은 원인의 실패가 수정 후 3회 연속 발생하면 반복을 중지하고 원인, 시도한 변경과 필요한 결정을 보고한다.

## 9. 검증 방법

### 9.1 자동 검증

- `npm.cmd run typecheck --prefix scheduler`
- `npm.cmd test --prefix web`
- `npm.cmd run typecheck --prefix web`
- `npm.cmd run build --prefix web`
- `git diff --check`

현재 scheduler에는 test script가 없으므로 존재하지 않는 명령을 성공 기준으로 가정하지 않는다.
single-flight 자동 test를 위해 파일 분할이나 새 test script가 필요하면 구현 전에 범위와 영향을 확인한다.

### 9.2 중복 실행 통제 검증

- 60초보다 늦게 응답하는 통제된 HTTP endpoint를 사용해 첫 tick의 요청을 진행 상태로 유지한다.
- 다음 tick에서 두 번째 HTTP 요청이 발생하지 않고 `진행 중이라 건너뜀` 로그가 남는지 확인한다.
- 첫 요청을 성공, 오류와 timeout으로 각각 종료한 뒤 다음 tick에서 새 요청이 시작되는지 확인한다.
- scheduler 요청과 별도의 통제된 API 요청을 겹쳐 한 `web` process의 실제 수집 실행이 `activeCollection`에 의해 하나로 병합되는지 server 로그 또는 계측 가능한 test evidence로 확인한다.

### 9.3 DB와 외부 API 실연동 검증

- 동일 최신 Release가 저장된 상태에서 두 번 이상의 scheduler 주기를 실행한 전후로 기술별 `(technology, external_id)` 행 수를 비교한다.
- 새 `external_id`가 나타난 경우에만 새 행이 한 건 생겼는지 확인한다.
- 기존 non-null `summary`와 `updated_at`을 주기 전후로 비교해 불필요한 재요약이나 덮어쓰기가 없는지 확인한다.
- `summary IS NULL`인 통제 가능한 행 또는 mock 경로에서 다음 실행의 요약 재시도와 저장 결과를 확인한다.
- 검증을 위해 실제 운영 데이터 삭제나 복구하기 어려운 수정을 하지 않는다.

### 9.4 Docker Compose 수동 검수

- `docker compose up --build`로 세 service를 시작하고 `docker compose ps`에서 상태를 확인한다.
- `docker compose logs -f scheduler`에서 분당 실행 시작·완료 순서와 건너뜀·실패 로그를 확인한다.
- 최소 두 번의 정상 주기를 관찰하고 web 화면과 DB에서 저장된 최신 Release와 요약을 확인한다.
- 메인 페이지에 개발용 수동 수집 버튼과 실행 결과 panel이 없고 최신 Release 목록과 상세 이동은 유지되는지 확인한다.
- web을 scheduler보다 늦게 준비시키거나 일시 중지해 실패가 기록되고, web 복구 후 다음 주기에 scheduler가 자동으로 정상 실행되는지 확인한다.

## 10. 중지 조건

다음 중 하나에 해당하면 현재 반복을 중지하고, 통과·실패한 Acceptance Criteria와 필요한 결정을 보고한다.

- 확정된 호출 방식, timeout 또는 종료 처리 범위를 바꿔야 하는 새로운 사유가 발생한다.
- 새 library, 공용 package 추출, 파일 분할, 아키텍처 변경 또는 분산 lock이 필요하지만 사용자 승인이 없다.
- GitHub·OpenAI API 자격 정보, model 접근 권한, MariaDB, Docker 또는 외부 network가 없어 실연동 검증을 진행할 수 없다.
- 실제 API quota, billing, rate limit 또는 외부 서비스 장애로 검증을 완료할 수 없다.
- 동일 원인의 구현 또는 검증 실패가 수정 후 3회 연속 반복된다.
- 단일 instance 범위를 넘어 여러 replica 사이의 동시 실행 방지가 필요해진다.
- 검증에 실제 데이터 삭제나 복구하기 어려운 변경이 필요하지만 명시적 승인이 없다.
- 다음 변경이 이 Task Spec의 Out of Scope를 필요로 한다.

## 11. 완료 조건

다음 조건을 모두 만족할 때만 작업을 성공으로 종료한다.

- AC 1~16이 모두 통과하고 cron 로그, HTTP 결과, DB 조회, 자동 검증과 Compose 실행 근거가 있다.
- 60초를 넘긴 실행에서 다음 tick이 실제로 건너뛰어졌고, 실행 종료 후 다음 주기에 복구됨을 확인했다.
- 반복 주기와 통제된 중복 API 요청이 겹쳐도 중복 행과 불필요한 OpenAI 요약이 발생하지 않았다.
- 개발용 수동 수집 UI는 제거되고 기존 Release 목록·상세 조회, Release 비교·저장, 요약 생성·보존·재시도 동작에는 회귀가 없다.
- secret, 전체 원문과 내부 stack이 scheduler 로그나 client 응답에 노출되지 않았다.
- 실행하지 못한 검증은 성공으로 간주하지 않고 사유와 영향을 명시했다.
- 새 dependency, 분산 lock, 아키텍처 변경, 파일 분할과 Out of Scope 기능을 사용자 승인 없이 추가하지 않았다.
- 실제 구현, 문제·원인·해결, Acceptance Criteria별 결과와 남은 제한을 새 Work Log에 기록했다.
- API 호출 방식, process-local single-flight, timeout, 종료 처리와 다중 instance 한계를 현재 구현에 연결한 학습 문서를 `docs/study/`에 작성했다.
