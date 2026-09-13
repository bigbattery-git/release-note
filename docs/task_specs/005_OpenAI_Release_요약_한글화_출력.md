# 005. OpenAI API를 이용한 Release 요약·한글화와 페이지 출력

- 작성일: 2026-09-13
- 기준: `technology_releases.description`을 요약·한글화해 저장하고 웹에서 보여주기 위한 사전 Task Spec
- 관련 문서: `docs/task_specs/003_테스트_버튼_최신_기술_Release_저장.md`, `docs/task_specs/004_Kysely_migration_전환.md`
- 상태: 구현 및 로컬 Acceptance Criteria 검증 완료 (`Docker Compose` 제외)

## 1. 목표 (Goal)

기존 GitHub Release 수집 흐름을 유지하면서 `technology_releases.description`의 핵심 내용을
OpenAI API로 요약하고 한글화한다. 생성한 결과는 `technology_releases.summary`에 저장하고,
사용자가 메인 페이지에서 기술별 Release의 저장된 요약을 확인할 수 있게 한다.

## 2. 배경

- 현재 `default_technologies`의 활성 기술을 기준으로 최신 안정 GitHub Release를 조회한다.
- 수집한 Release는 `(technology, external_id)`를 기준으로 `inserted`, `updated`, `skipped` 중 하나로 처리한다.
- `technology_releases.description`에는 GitHub Release 본문이 원문 그대로 `LONGTEXT NULL`로 저장된다.
- 현재 페이지는 수집 결과의 기술명, 버전과 저장 상태만 보여주며 Release 본문이나 요약은 보여주지 않는다.
- `web`에는 OpenAI SDK가 설치되어 있지 않다.
- 사용자는 로컬 환경에 `OPENAI_API_SECRET_KEY`를 추가했지만, 현재 `compose.yaml`의 `web.environment`에는 해당 값을 전달하는 설정이 없다.
- DB migration은 Kysely TypeScript migration과 `kysely-ctl`을 사용한다.

## 3. 요구사항 (Requirements)

### 3.1 DB schema

- 새 Kysely migration으로 `technology_releases` table에 `summary` column을 추가한다.
- `summary`의 MariaDB type은 `LONGTEXT`이고 `NULL`을 허용한다.
- 기존 Release 행은 migration 직후 `summary = NULL` 상태를 유지한다.
- 애플리케이션의 Kysely table type에도 `summary: string | null`을 반영한다.
- 기존 migration 파일을 수정하지 않고 새 timestamp migration을 추가한다.

### 3.2 Release 수집·저장 순서

한 번의 수집 실행은 활성 기술별로 다음 순서를 따른다.

1. 현재와 동일한 기준으로 GitHub의 최신 안정 Release를 조회한다.
2. `(technology, external_id)`를 기준으로 Release를 `inserted`, `updated`, `skipped` 처리한다.
3. 동일 Release의 기존 `description`과 새 `description`이 다르면 기존 `summary`를 `NULL`로 무효화한다.
4. 해당 DB 행의 `summary`가 `NULL`인지 확인한다.
5. `summary IS NULL`이고 요약 가능한 `description`이 있으면 OpenAI API를 호출한다.
6. 정상 응답을 받으면 요약·한글화 결과를 같은 행의 `summary`에 저장한다.
7. 저장된 `summary`와 요약 처리 상태를 수집 결과에 포함해 페이지에 표시한다.

- `description`이 변경되지 않았고 기존 `summary`가 non-null이면 `inserted`, `updated`, `skipped` 상태와 관계없이 OpenAI API를 다시 호출하지 않는다.
- `description`이 변경된 경우에만 기존 `summary`를 무효화하고 새 원문을 기준으로 다시 생성한다. title, URL 등 다른 metadata만 변경되면 기존 요약을 유지한다.
- 공백만 있는 `description`은 요약 가능한 원문으로 취급하지 않는다.
- `description`이 `NULL`이거나 공백뿐이면 OpenAI API를 호출하지 않고 `summary`를 `NULL`로 유지한다.
- 동시 또는 중복 실행이 동일 행의 요약을 불필요하게 여러 번 생성하지 않도록 기존 단일 실행 병합 동작을 유지한다.

### 3.3 요약·한글화 결과

- 생성 결과의 주 언어는 한글이어야 한다.
- version, package name, API name, option, code identifier 등 기술명과 식별자는 원문의 의미를 유지한다.
- 결과는 입력 `description`에 있는 사실만을 사용하며, 원문에 없는 변경 사항을 임의로 추가하지 않는다.
- 일반 Release는 핵심 변경 사항을 3~5개 bullet로 생성한다.
- 변경 사항이 많은 대규모 Release는 Breaking Changes, 보안, 주요 기능, 성능, migration 등 의미 있는 주제로 묶고 전체 10개 bullet 이내에서 확장한다.
- 대규모 Release에서도 모든 변경을 나열하지 않고 사용자 영향과 migration 필요성이 큰 항목을 우선한다.
- Responses API의 `max_output_tokens`는 `2,000`으로 제한한다. 이는 목표 출력량이 아니라 응답 잘림과 과도한 생성을 막는 안전 상한이다.
- 빈 문자열이나 공백뿐인 모델 출력은 성공 결과로 저장하지 않는다.
- 정확한 출력 형식, 목표 분량과 model은 구현 전 확인 사항에서 확정한다.

### 3.4 OpenAI API 연동

- OpenAI API 호출은 server에서만 수행하며 browser에서 직접 호출하지 않는다.
- API 인증에는 사용자가 설정한 `OPENAI_API_SECRET_KEY`를 사용한다.
- OpenAI SDK의 기본 환경 변수명에 의존하지 않고 `OPENAI_API_SECRET_KEY` 값을 SDK client의 `apiKey`에 명시적으로 전달한다.
- model ID는 server 환경 변수 `OPENAI_MODEL`에서 읽고 source code에 고정하지 않는다.
- `OPENAI_MODEL`이 없거나 비어 있으면 OpenAI API를 호출하지 않고 설정 오류로 처리한다.
- secret은 source code, DB, client bundle, browser 응답 또는 log에 기록하지 않는다.
- Docker Compose의 `web` container에서도 `OPENAI_API_SECRET_KEY`를 읽을 수 있도록 환경 변수 전달 경로를 구성한다.
- 실제 secret 값은 repository에 추가하지 않고 example 환경 파일에는 변수명과 비밀값이 아닌 안내용 placeholder만 기록한다.
- API 요청에는 model과 요약·한글화 지시, 원문 `description`, 출력 상한을 명시한다.
- API 응답 status와 필요한 응답 형식을 검증한 뒤 유효한 text만 저장한다.
- OpenAI 공식 Responses API와 OpenAI SDK를 사용한다.
- OpenAI SDK package 설치와 `web/package.json`, `web/package-lock.json` 변경은 사용자가 승인했다.
- `OPENAI_MODEL` 설정 방법과 model 변경 시 확인 사항은 `docs/tech/`에 문서화한다.

### 3.5 실패 처리와 재시도

- GitHub 조회 또는 Release DB 저장 실패는 기존 흐름과 같이 해당 수집 실행의 실패로 처리한다.
- Release 저장 후 OpenAI API 호출이나 요약 DB 저장이 실패해도 이미 저장한 Release 원문과 metadata를 삭제하거나 잘못된 값으로 되돌리지 않는다.
- 요약 실패 시 `summary`는 `NULL`을 유지해 다음 수집 실행에서 다시 시도할 수 있게 한다.
- Release 저장 성공 후 요약만 실패하면 전체 실패로 덮지 않고 부분 성공 응답을 반환한다.
- 기술별 결과에는 `summaryStatus`를 포함해 최소한 생성 완료, 기존 요약 유지, 원문 없음, 생성 실패를 구분한다.
- 요약 실패를 `skipped` 또는 전체 성공으로 오인할 수 없도록 기술별 결과와 안전한 오류 메시지를 반환한다.
- 오류 메시지에는 API key, request header, 원문 전체, 내부 stack 또는 OpenAI 응답의 민감한 상세 내용을 포함하지 않는다.
- 한 번의 사용자 실행 안에서 무제한 자동 retry는 하지 않는다.

### 3.6 페이지 출력

- 현재 메인 페이지의 기술별 Release 결과에 저장된 `summary`를 표시한다.
- 화면에는 DB에 저장된 값을 사용하며 client에서 OpenAI API를 다시 호출하거나 별도로 요약하지 않는다.
- `summary`가 없으면 요약이 아직 생성되지 않았거나 원문이 없음을 사용자가 구분할 수 있는 상태를 표시한다.
- 긴 요약도 레이아웃을 깨지 않고 읽을 수 있어야 하며 UI styling은 Tailwind CSS로 구현한다.
- 수집 중 상태, `inserted`·`updated`·`skipped` 표시와 기존 오류 화면은 유지한다.

## 4. 완료 조건 (Acceptance Criteria)

### 사전 조건

- `web`과 MariaDB가 실행 가능하고 최신 Kysely migration을 적용할 수 있다.
- 실제 OpenAI API 호출 권한이 있는 `OPENAI_API_SECRET_KEY`가 server 실행 환경에 설정되어 있다.
- 선택한 model을 해당 OpenAI project에서 사용할 수 있고 외부 API에 접근할 수 있다.

| 번호 | Acceptance Criteria |
| --- | --- |
| 1 | 새 migration 적용 후 `technology_releases.summary`가 `LONGTEXT NULL`로 존재하고 기존 행의 값은 `NULL`이다. |
| 2 | migration을 다시 실행해도 column이 중복 생성되지 않으며 Kysely migration 이력이 정상 상태다. |
| 3 | 기존 GitHub 수집의 `inserted`, `updated`, `skipped` 판정과 중복 방지 동작이 유지된다. |
| 4 | `description`이 있고 `summary IS NULL`인 Release를 처리하면 OpenAI API가 호출되고, 핵심 내용이 한글로 요약된 non-empty 결과가 같은 행의 `summary`에 저장된다. |
| 5 | `description`이 변경되지 않고 `summary`가 이미 non-null인 행을 다시 수집하면 OpenAI API를 호출하거나 기존 요약을 덮어쓰지 않는다. |
| 6 | 동일 Release의 `description`이 변경되면 기존 `summary`를 무효화하고 변경된 원문으로 새 요약을 생성하지만, 다른 metadata만 변경되면 기존 요약을 유지한다. |
| 7 | `description`이 `NULL` 또는 공백뿐이면 OpenAI API를 호출하지 않고 `summary`를 `NULL`로 유지한다. |
| 8 | OpenAI API 또는 요약 저장 실패 시 Release 원문과 metadata는 유지되고 `summary`는 `NULL`이라 다음 실행에서 재시도할 수 있다. |
| 9 | 요약 실패는 부분 성공 응답과 기술별 `summaryStatus`로 구분되며 secret, request header, 원문 전체와 내부 stack이 노출되지 않는다. |
| 10 | 일반 Release는 3~5개 bullet, 대규모 Release는 주제별 최대 10개 bullet로 요약되고 `max_output_tokens`는 `2,000`을 넘지 않는다. |
| 11 | 정상 실행 후 메인 페이지의 각 기술별 결과에서 DB에 저장된 `summary`를 확인할 수 있다. |
| 12 | 요약이 없는 Release는 빈 영역 대신 미생성 또는 원문 없음 상태를 확인할 수 있다. |
| 13 | 화면의 기존 수집 버튼, 진행 상태, 저장 상태와 집계가 계속 동작하고 긴 요약에서도 레이아웃이 깨지지 않는다. |
| 14 | `OPENAI_API_SECRET_KEY`와 `OPENAI_MODEL`이 server에서만 사용되며 API key가 repository, client bundle, browser Network 응답과 화면에 노출되지 않는다. |
| 15 | 관련 unit test, `npm run typecheck --prefix web`, `npm test --prefix web`, `npm run build --prefix web`이 통과한다. |
| 16 | 실제 GitHub 응답, MariaDB 저장 결과, 실제 OpenAI API 응답과 browser 화면을 연결한 end-to-end 수동 검수가 성공한다. |

## 5. 작업 범위에서 제외하는 항목 (Out of Scope)

- 과거 Release 전체 이력을 새로 수집하는 backfill
- non-null `summary`를 일괄 재생성하거나 사용자가 수동으로 다시 생성하는 기능
- 다국어 선택, 원문·번역문 전환과 사용자별 요약 설정
- 별도 Release 목록·상세 route 또는 관리자 페이지 신설
- background job, queue, cron, scheduler와 정기 실행 주기 추가
- streaming 응답, 실시간 token 출력과 client-side OpenAI 호출
- embedding, vector database, 검색 증강, web search 또는 외부 자료 결합
- OpenAI fine-tuning, prompt 관리 UI, 사용량·비용 dashboard
- 사용자 인증·권한, 알림과 production 배포 설정

## 6. 제약사항

- 실제 DB table name은 `technology_releases`를 사용한다.
- 새 column과 관련 code identifier는 정정된 철자인 `summary`를 사용한다.
- 기존 Next.js, Node.js, MariaDB, Kysely 구성과 Release 수집 경계를 유지한다.
- UI는 Tailwind CSS만 사용한다.
- OpenAI SDK 설치와 이에 따른 `web/package.json`, `web/package-lock.json` 변경은 승인되었다. 그 밖의 새 library 설치, 아키텍처 변경, 파일 분할 또는 refactoring은 변경 전에 이유, 대안과 영향 범위를 설명하고 사용자 승인을 받는다.
- `OPENAI_API_SECRET_KEY`의 실제 값은 확인·출력·문서화하지 않는다.
- OpenAI API는 과금과 rate limit이 있는 외부 서비스이므로 중복 호출을 억제하고 호출 여부를 검증 가능하게 만든다.
- 구현 및 검증 결과는 별도 Work Log에 한글로 기록한다.

## 7. 확정 사항과 남은 확인 사항

### 7.1 확정 사항

1. DB column과 code identifier는 `summary`를 사용한다.
2. model은 `OPENAI_MODEL=gpt-5.6-terra`로 설정하고 server 환경 변수로 주입한다.
3. OpenAI SDK 설치와 package·lockfile 변경을 허용한다.
4. 일반 Release는 3~5개 bullet, 대규모 Release는 주제별 최대 10개 bullet로 요약하고 `max_output_tokens`는 `2,000`으로 제한한다.
5. `description` 변경 시에만 기존 `summary`를 무효화하고 재생성한다.
6. 현재 메인 페이지의 수집 결과 카드에 요약을 표시한다.
7. Release 저장 후 요약만 실패하면 기술별 `summaryStatus`가 포함된 부분 성공 응답을 사용한다.

### 7.2 남은 확인 사항

- 기능 요구사항의 미확정 항목은 없다. 현재 환경에서 실행하지 못한 `Docker Compose` 검증만 완료 보고에 남긴다.

## 8. 작업 루프 계획

각 반복은 연결된 Acceptance Criteria를 먼저 정하고, 해당 범위의 구현과 검증이 끝난 뒤 다음 단계로 이동한다.

1. **환경 확인**: `OPENAI_API_SECRET_KEY`, `OPENAI_MODEL`, model 접근 권한과 Docker 전달 경로를 확인한다.
2. **DB 변경**: 새 Kysely migration과 DB type을 반영하고 AC 1~2를 검증한다.
3. **요약 경계 구현**: server-only OpenAI 요청, 입력·응답 검증과 secret 경계를 구현하고 통제된 test double로 AC 4~10, 14를 검증한다.
4. **수집 흐름 연결**: 기존 저장 판정 뒤 `summary IS NULL` 처리, `description` 변경 시 무효화와 재시도 가능 상태를 연결해 AC 3~9를 검증한다.
5. **페이지 출력**: 수집 결과에 저장된 요약 상태와 내용을 포함하고 Tailwind CSS로 출력해 AC 11~13을 검증한다.
6. **실연동 검증**: 실제 GitHub, MariaDB, OpenAI API와 browser를 연결해 AC 16을 검증한다.
7. **회귀·기록**: test, typecheck와 build를 실행해 AC 15를 검증하고 결과와 미검증 항목을 Work Log에 기록한다.

각 반복의 검증이 실패하면 원인을 확인하고 같은 범위에서 안전하게 수정 가능한 경우에만 수정·재검증한다. 통과한 조건과 남은 조건을 분리해 기록한다.

## 9. 검증 방법

### 9.1 자동 검증

- OpenAI 호출을 test double로 대체해 `summary`의 null/non-null, 빈 `description`, 정상 응답, 빈 출력과 API 실패 분기를 검증한다.
- 같은 Release의 반복 실행에서 기존 `summary`가 보존되고 OpenAI 호출 횟수가 증가하지 않는지 검증한다.
- `description` 변경 시에는 요약이 재생성되고 다른 metadata만 변경되면 기존 요약이 보존되는지 검증한다.
- 일반·대규모 Release 입력에서 bullet 수와 `max_output_tokens: 2000` 요청값을 검증한다.
- 기존 Release 비교·GitHub parsing test와 새 test를 함께 실행한다.
- `npm run typecheck --prefix web`, `npm test --prefix web`, `npm run build --prefix web`을 실행한다.

### 9.2 DB·migration 검증

- 임시 검증 DB 또는 안전한 개발 DB에서 `npx kysely migrate latest`를 실행한다.
- `information_schema`로 `summary`의 type과 nullable 여부를 확인한다.
- 기존 행, 신규 행, 요약 성공 행과 실패 행을 query해 `description`과 `summary` 상태를 대조한다.
- migration 재실행 시 중복 적용이 없는지 확인한다.

### 9.3 외부 연동 검증

- 실제 `OPENAI_API_SECRET_KEY`를 server 환경에만 주입한 상태로 한 건의 요약 요청을 실행한다.
- OpenAI HTTP 응답 성공, 저장된 한글 요약, 대상 Release 식별자와 DB 행을 대조한다.
- Docker Compose를 사용하면 `web` container 내부에서 변수의 실제 값을 출력하지 않고 설정 여부만 확인한다.
- 인증 실패 또는 통제 가능한 API 실패에서 Release 보존, `summary = NULL`과 안전한 부분 성공 응답을 확인한다.

### 9.4 브라우저 수동 검수

- 메인 페이지에서 수집을 실행해 기술별 상태, version과 저장된 한글 요약이 함께 표시되는지 확인한다.
- 같은 Release를 다시 실행해 기존 요약이 유지되고 중복 OpenAI 호출이 없는지 server 기록 또는 test evidence로 확인한다.
- 요약이 없는 상태와 요약 실패 상태가 사용자에게 구분되는지 확인한다.
- browser Network와 rendered HTML에서 secret, 내부 stack과 원문 전체가 불필요하게 노출되지 않는지 확인한다.
- 긴 요약을 표시해 desktop과 좁은 viewport에서 overflow나 layout 깨짐이 없는지 확인한다.

## 10. 중지 조건

다음 중 하나에 해당하면 현재 반복을 중지하고, 통과·실패한 Acceptance Criteria, 확인한 원인과 필요한 결정을 보고한다.

- 실제 `OPENAI_MODEL` 값이 없거나 해당 model에 접근할 수 없다.
- 승인된 OpenAI SDK 외의 새 library 설치가 필요하지만 사용자 승인이 없다.
- 기존 수집 구조 변경, 새 UI route, 파일 분할 또는 refactoring이 필요하지만 사용자 승인이 없다.
- `OPENAI_API_SECRET_KEY`, model 접근 권한, MariaDB 또는 외부 network가 없어 실제 연동 검증을 진행할 수 없다.
- API quota, billing, rate limit 또는 외부 서비스 장애로 실제 검증을 완료할 수 없다.
- 동일 원인의 검증 실패가 수정 후 3회 연속 반복된다.
- 다음 변경이 이 Task Spec의 Out of Scope를 필요로 한다.
- 검증에 실제 데이터 삭제나 복구하기 어려운 조치가 필요하지만 명시적 승인이 없다.

## 11. 완료 조건

다음 조건을 모두 만족할 때만 작업을 성공으로 종료한다.

- AC 1~16이 모두 통과하고 DB query, test 결과, 실제 API 응답 상태와 browser 확인 근거가 있다.
- 기존 Release 수집·저장·중복 방지 동작에 회귀가 없다.
- OpenAI 요약 성공, 기존 요약 보존, 원문 없음과 요약 실패 후 재시도 경로를 각각 확인했다.
- 실제 secret이 source, 문서, DB, log, client bundle과 browser 응답에 남아 있지 않다.
- 실행하지 못한 검증은 성공으로 간주하지 않고 사유와 영향을 명시한다.
- 새 dependency, 아키텍처 변경, 파일 분할과 Out of Scope 기능이 사용자 승인 없이 추가되지 않았다.
- 구현 내용, 문제·원인·해결, Acceptance Criteria별 결과와 남은 제한을 Work Log에 기록했다.

## 12. 참고 자료

- [OpenAI API Reference - Create a model response](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [OpenAI API - Models](https://developers.openai.com/api/docs/models)
