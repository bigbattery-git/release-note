# GitHub Release 수집 기능 유지보수 학습

- 작성일: 2026-09-10
- 대상 기능: Next.js, Node.js, React 최신 안정 Release 수동 수집과 MariaDB 저장
- 관련 Task Spec: `docs/task_specs/003_테스트_버튼_최신_기술_Release_저장.md`
- 관련 Work Log: `docs/work_logs/005_최신_GitHub_Release_수동_저장.md`

## 1. 학습 목표

이 문서를 학습한 뒤에는 다음 질문에 답하고 관련 코드를 안전하게 수정할 수 있어야 한다.

- 버튼을 누른 뒤 GitHub API와 MariaDB까지 어떤 순서로 호출되는가?
- stable Release와 prerelease를 어떤 기준으로 구분하는가?
- 같은 Release가 중복 저장되지 않는 이유는 무엇인가?
- `default_technologies`에 행을 추가하거나 비활성화하면 수집 대상이 어떻게 바뀌는가?
- 세 대상 중 하나가 실패했을 때 부분 저장이 발생하지 않는 이유는 무엇인가?
- `app` 또는 `lib` 변경 후 Docker image 재빌드가 필요한 경우를 어떻게 구분하는가?

## 2. 이 기능을 구현하며 한 작업

### 2.1 데이터베이스

- `release` 애플리케이션 DB와 migration 실행 경로를 추가했다.
- `technology_releases`에 외부 Release ID, 버전, 제목, 본문, URL, 발행일과 생성·갱신 시각을 저장한다.
- `(technology, external_id)` unique constraint로 같은 기술의 같은 Release가 두 번 저장되지 않게 했다.
- 최초 schema의 `technology ENUM(...)`을 `VARCHAR(50)`으로 변경했다.
- `default_technologies`를 추가해 technology code, 표시명, GitHub Releases path, 활성 여부와 정렬 순서를 관리한다.
- `technology_releases.technology`가 `default_technologies.technology`를 참조하도록 foreign key를 추가했다.
- 현재는 TypeScript migration을 이름순으로 적용하며 `kysely_migration` 이력을 관리한다.

### 2.2 GitHub Release 수집

- `default_technologies`의 `enabled = 1`인 행을 수집 대상으로 읽는다.
- 대상별 GitHub Releases REST API를 순차 호출한다.
- Zod로 외부 JSON의 필수 필드와 타입을 runtime에서 검증한다.
- `draft === false`, `prerelease === false`, `published_at !== null` 조건을 만족하는 항목 중 가장 최근 항목을 고른다.
- `GITHUB_TOKEN`이 있을 때만 `Authorization: Bearer ...` header를 보낸다.

### 2.3 저장과 오류 처리

- 세 대상의 조회·검증이 모두 끝난 뒤 MariaDB transaction을 시작한다.
- 기존 행이 없으면 `inserted`, 값이 달라지면 `updated`, 같으면 `skipped`로 분류한다.
- 한 대상의 API가 실패하면 DB transaction 전에 중단되므로 다른 대상만 부분 저장되지 않는다.
- Route Handler는 GitHub 오류를 대상이 포함된 안전한 메시지로 바꾸고 token, DB password와 stack을 응답에 포함하지 않는다.

### 2.4 웹 화면과 실행 환경

- Client Component가 `/api/releases/collect`에 `POST` 요청을 보낸다.
- 실행 중에는 버튼을 비활성화하고 완료 후 대상별 버전과 처리 건수를 표시한다.
- Docker의 `web` service는 개발 서버 시작 전에 migration을 실행한다.
- `.env`는 secret을 보관하고 `.env.example`은 빈 값 또는 placeholder만 제공한다.

## 3. 전체 동작 흐름

```text
[사용자 버튼]
      |
      v
[Client Component]
      | POST /api/releases/collect
      v
[Next.js Route Handler]
      |
      v
[default_technologies 조회]
      |
      v
[GitHub Releases API 3개 순차 조회 및 Zod 검증]
      |
      v
[최신 stable Release 3건 선택]
      |
      v
[MariaDB transaction: insert / update / skip]
      |
      v
[건수와 대상별 결과를 JSON으로 반환하여 화면 표시]
```

DB catalog 조회는 외부 호출보다 먼저 일어나지만, Release 쓰기 transaction은 외부 조회가 모두
성공한 뒤 시작한다. 이 순서가 “일부 성공한 대상만 저장되는 상태”를 막는 핵심이다.

## 4. 파일별 책임

| 파일 | 책임 | 수정할 때 확인할 영향 |
| --- | --- | --- |
| `web/app/release-test-panel.tsx` | 버튼, 실행 중 상태, 결과 UI | API 응답 타입과 접근성 상태 |
| `web/app/api/releases/collect/route.ts` | POST endpoint, 오류를 HTTP 응답으로 변환 | 외부에 노출되는 메시지와 status code |
| `web/lib/releases/github.ts` | GitHub 호출, Zod 검증, stable 선택, DTO 변환 | API version, rate limit, 응답 schema |
| `web/lib/releases/service.ts` | catalog 조회, 전체 작업 순서, transaction 저장 | 부분 실패 정책과 처리 건수 |
| `web/lib/releases/release-comparison.ts` | 기존 행과 새 Release의 변경 여부 비교 | 어떤 필드 변경을 update로 볼지 |
| `web/lib/database.ts` | Kysely DB 타입과 lazy connection pool | build 시점 환경변수 접근, pool lifecycle |
| `web/migrations/*.ts` | Kysely 기반 DB schema의 순차 변경 | 기존 데이터, FK, index, 재적용 여부 |
| `web/kysely.config.ts` | 공식 CLI의 MariaDB 연결, migration provider와 기존 이력 호환 | 환경변수, migration folder와 이력 이름 |
| `compose.yaml`, `web/Dockerfile` | container 환경변수, migration과 source 포함 | bind mount 범위와 image rebuild |

## 5. 우선순위별로 공부할 것

### 1순위: HTTP 요청과 Next.js server/client 경계

알아야 할 내용:

- Client Component에서 `fetch()`로 POST 요청을 보내는 과정
- `app/**/route.ts`가 HTTP endpoint가 되는 규칙
- browser에 포함되는 코드와 server에서만 실행되는 코드의 차이
- HTTP 200, 500, 502의 의미와 JSON 오류 응답

현재 코드와 연결할 질문:

- 왜 `GITHUB_TOKEN`과 DB password를 Client Component에서 읽으면 안 되는가?
- 왜 DB client는 module import 시점이 아니라 실제 요청 시점에 만들어야 하는가?

### 2순위: GitHub Releases REST API

알아야 할 내용:

- Repository의 tag와 GitHub Release의 차이
- `draft`, `prerelease`, `published_at`, `id`, `tag_name`, `body`, `html_url`
- 인증 요청과 비인증 요청의 rate limit 차이
- HTTP 403, 404, 429와 timeout 처리

현재 프로젝트에서는 GitHub Releases REST API로 published Release를 가져올 수 없는 기술을
수집 대상으로 취급하지 않는다. 다른 다운로드 API나 changelog가 있어도 이 기준을 대신하지 않는다.

### 3순위: 외부 데이터 runtime 검증

TypeScript interface는 compile 시점에만 도움을 주며 실제 HTTP JSON을 검사하지 않는다.
GitHub가 예상과 다른 값을 반환하거나 오류 객체를 반환할 수 있으므로 Zod parsing이 필요하다.

공부할 질문:

- `unknown`을 바로 원하는 타입으로 단언하면 어떤 장애가 생기는가?
- 필수 필드가 누락됐을 때 저장을 계속하는 것과 중단하는 것의 차이는 무엇인가?
- `nullable`과 `optional`은 어떻게 다른가?

### 4순위: 관계형 DB 모델링

`default_technologies`는 허용된 technology와 수집 설정을 관리하는 parent table이고,
`technology_releases`는 실제 Release를 저장하는 child table이다.

```text
default_technologies (1) ---- (N) technology_releases
        technology        FK       technology
```

공부할 내용:

- primary key, foreign key, unique constraint의 역할 차이
- `VARCHAR`와 `ENUM`의 변경 비용과 유연성 차이
- `ON UPDATE CASCADE`, `ON DELETE RESTRICT`가 데이터에 주는 영향
- catalog row의 `enabled`와 실제 행 삭제의 차이

technology를 더 이상 지원하지 않을 때는 parent 행을 삭제하기보다 `enabled = 0`으로 비활성화하는
편이 기존 Release의 참조 무결성을 유지한다.

### 5순위: migration과 schema 변경

운영 DB schema는 HeidiSQL에서 직접 바꾼 뒤 끝내지 않고 새 번호의 migration으로 남겨야 한다.
현재 `kysely-ctl`은 `web/migrations`의 TypeScript migration을 이름순으로 읽고 Kysely의
`kysely_migration` table에 적용 이력을 기록한다. 기존 `app_migrations` 기록이 있으면
timestamp 파일명 기준의 표준 이력으로 자동 이관한다. 새 migration은 `web`에서
`npx kysely migrate make <name>`으로 생성한다.

공부할 질문:

- 이미 데이터가 있는 `ENUM`을 `VARCHAR`로 바꿀 때 기존 값이 유효한지 왜 먼저 확인해야 하는가?
- DDL이 중간에 실패했는데 migration 이력이 기록되지 않았다면 다음 실행에서 어떤 문제가 생기는가?
- schema 변경 전 backup과 staging 검증이 필요한 이유는 무엇인가?

### 6순위: Kysely와 transaction

- Kysely의 애플리케이션 DB interface는 query의 TypeScript 타입을 설명한다.
- 실제 table은 Kysely migration의 `up` 함수와 schema builder가 만든다.
- transaction callback 안에서 오류가 발생하면 해당 쓰기 작업을 rollback한다.
- 현재 구조는 외부 API 호출을 transaction 밖에서 수행해 DB lock 시간을 줄인다.

### 7순위: 중복 방지와 멱등성

같은 버튼을 여러 번 눌러도 최종 DB 상태가 같아야 한다. 이를 멱등성이라고 이해하면 된다.

- 애플리케이션 비교 로직은 `inserted`, `updated`, `skipped`를 판정한다.
- DB unique constraint는 동시 요청이나 애플리케이션 실수에 대한 마지막 안전장치다.
- UI 버튼 비활성화는 한 browser에서의 중복 클릭만 막으며 DB constraint를 대신하지 않는다.

### 8순위: Docker build와 bind mount

현재 Compose는 `web/app`만 `/app/app`에 bind mount한다. 따라서 파일별 반영 방식이 다르다.

| 변경 위치 | 실행 중 바로 반영 가능성 | 필요한 조치 |
| --- | --- | --- |
| `web/app/**` | 높음 | Fast Refresh 확인 |
| `web/lib/**` | 현재 container image에는 자동 반영 안 됨 | `docker compose up --build` |
| `web/migrations/**` | 자동 반영 안 됨 | image rebuild 후 migration 실행 |
| `web/package.json` | 자동 반영 안 됨 | image rebuild로 `npm ci` 재실행 |
| `compose.yaml` | 자동 반영 안 됨 | service 재생성 |

새 Route Handler만 `app` mount로 들어가고 새 `lib`가 이전 image에 없으면
`Module not found: Can't resolve ...`가 발생할 수 있다.

## 6. 주요 유지보수 시나리오

### GitHub 기반 기술 추가

1. 공식 GitHub Repository와 Releases API 제공 여부를 확인한다.
2. 새 migration에서 `default_technologies` seed를 추가한다.
3. `technology`, `display_name`, `/repos/{owner}/{repo}/releases`, `sort_order`를 기록한다.
4. 실제 응답이 현재 공통 Zod schema와 stable 판정 규칙을 만족하는지 테스트한다.
5. migration, 수집, DB 저장, 재실행과 UI 표시를 검증한다.

DB에 직접 행을 넣으면 기능은 동작할 수 있지만 환경 재생성과 이력 추적을 위해 반드시 migration에도 남긴다.

### 기술 수집 일시 중지

- `default_technologies.enabled`를 `0`으로 변경하는 migration을 만든다.
- 기존 `technology_releases`는 삭제하지 않는다.
- 다음 수집 결과에서 해당 기술이 제외되는지 확인한다.

### Repository 이전

- 새 migration에서 `releases_path`를 변경한다.
- 공식성, redirect 여부, Release ID 충돌 가능성을 확인한다.
- 기존 Release를 유지할지 별도 technology code로 분리할지 결정한다.

### API 장애 조사

1. HTTP status와 대상 technology를 확인한다.
2. `X-RateLimit-Remaining`, token 설정 여부와 Repository path를 확인한다.
3. 실제 응답이 배열인지와 Zod 오류 원인을 확인한다.
4. 실패를 업데이트 없음으로 바꾸지 않는다.
5. secret이나 전체 stack을 browser 응답에 노출하지 않는다.

## 7. 검증 방법

```sh
npm test --prefix web
npm run typecheck --prefix web
npm run build --prefix web
npm run db:migrate --prefix web
```

기능 검수 순서:

1. `default_technologies`에 활성 대상과 path가 맞는지 확인한다.
2. 첫 실행에서 대상별 Release가 저장되는지 확인한다.
3. 재실행에서 행 수가 늘지 않고 `skipped`가 표시되는지 확인한다.
4. 통제된 데이터 변경 후 재실행에서 기존 행이 갱신되는지 확인한다.
5. 잘못된 Repository path로 API 실패를 재현하고 부분 저장이 없는지 확인한다.
6. browser Network 응답에 token, password와 stack이 없는지 확인한다.

## 8. 주의사항

- `.env.example`에 실제 token이나 password를 넣지 않는다.
- 노출된 token은 파일에서 지우는 것만으로 안전해지지 않으므로 발급처에서 revoke 또는 rotate한다.
- migration 파일을 이미 적용한 뒤 내용을 수정하지 말고 새 번호의 migration을 추가한다.
- parent technology를 삭제하면 `ON DELETE RESTRICT` 때문에 기존 Release가 있을 때 실패한다.
- 외부 API 호출을 긴 DB transaction 안으로 옮기면 lock 시간이 증가할 수 있다.
- Docker에서 `lib`, migration 또는 package가 바뀌면 browser 새로고침만으로 반영되지 않는다.
- 1분 scheduler는 아직 구현되지 않았으며, 추가할 때 중복 실행과 GitHub rate limit을 다시 설계해야 한다.

## 9. 학습 체크리스트

- [ ] Route Handler와 Client Component의 실행 위치 차이를 설명할 수 있다.
- [ ] `GITHUB_TOKEN`이 선택 사항인 경우와 필요한 경우를 설명할 수 있다.
- [ ] `draft`와 `prerelease`를 제외하는 코드를 찾고 수정할 수 있다.
- [ ] Zod 검증 실패가 Route Handler 응답까지 전달되는 흐름을 추적할 수 있다.
- [ ] `default_technologies`와 `technology_releases`의 1:N 관계를 설명할 수 있다.
- [ ] foreign key와 unique constraint가 각각 막는 오류를 설명할 수 있다.
- [ ] 새 technology를 migration으로 추가하고 검증할 수 있다.
- [ ] insert, update, skip 판정 기준을 설명할 수 있다.
- [ ] Docker에서 `app` 변경과 `lib` 변경의 반영 방식 차이를 설명할 수 있다.
- [ ] test, typecheck, build, migration과 browser 검수를 순서대로 수행할 수 있다.

## 10. 공식 참고 자료

- [Next.js Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Next.js Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [GitHub REST API - Releases](https://docs.github.com/en/rest/releases/releases)
- [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [Kysely Transactions](https://kysely.dev/docs/category/transactions)
- [Kysely Migrations](https://kysely.dev/docs/category/migrations)
- [MariaDB Foreign Keys](https://mariadb.com/docs/server/ha-and-performance/optimization-and-tuning/optimization-and-indexes/foreign-keys)
- [MariaDB ALTER TABLE](https://mariadb.com/docs/server/reference/sql-statements/data-definition/alter/alter-table)
- [MariaDB VARCHAR](https://mariadb.com/docs/server/reference/data-types/string-data-types/varchar)
