# 010. TanStack Query 클라이언트 조회 전환

- 작업일: 2026-09-13
- 작업 범위: `/`와 `/technologies/[technology]`의 DB 직접 조회를 GET API와 TanStack Query 기반 Client Component 조회로 전환
- 기록 기준: Task Spec `docs/task_specs/008_TanStack_Query_클라이언트_조회_전환.md`, 변경 파일, unit test·typecheck·build·로컬 API·브라우저 검증 결과

## 1. 작업 목적

Server Component에서 MariaDB를 직접 조회하던 최신 Release 목록과 technology별 이력 목록을
Client Component의 TanStack Query 조회로 전환했다. query 결과는 60초 동안 fresh로 유지하고,
화면에 active observer가 있는 동안 60초마다 자동으로 다시 조회하도록 구성했다.

반복되는 loading·error·retry UI는 `web/components/`에서 관리하고 route별 화면 component와 구분했다.

## 2. 수행한 작업과 선택 이유

- `/api/releases/latest` GET Route Handler를 추가해 기존 `getLatestTechnologyReleases()` 결과를 JSON으로 반환한다.
- `/api/technologies/[technology]/releases?page=N` GET Route Handler를 추가해 기존 page 검증, 정렬과 pagination query를 재사용한다.
- 두 API는 `Cache-Control: no-store`를 사용해 client freshness를 TanStack Query가 관리하게 했다.
- `web/lib/releases/client.ts`에 query key, fetch 함수, 안전한 API 오류와 공통 query timing을 구성했다.
- 두 query에 `staleTime: 60_000`과 `refetchInterval: 60_000`을 적용했다. freshness 관리와 active query의 주기 조회는 서로 다른 책임이므로 두 option을 함께 사용했다.
- 400·404처럼 같은 요청으로 복구할 수 없는 오류는 자동 retry하지 않고, network·5xx 오류만 최대 3회 retry하도록 했다.
- `web/app/page.tsx`와 `web/app/technologies/[technology]/page.tsx`에서는 DB 조회를 제거하고 Client Component 배치와 route parameter 전달만 담당하게 했다.
- pagination query key에 `technology`와 모든 `page` 값을 포함하고 `keepPreviousData`를 사용해 page 이동 중 기존 목록을 유지하면서 전환 상태를 표시하게 했다.
- 공용 `QueryStatusPanel`을 `web/components/`에 두어 두 목록의 loading·error·retry UI를 재사용했다.
- `web/Dockerfile`이 새 `web/components`를 image의 `/app/components`로 복사하도록 보완했다.
- Docker 개발 환경에서 `app`뿐 아니라 `components`와 `lib` 변경도 container에 즉시 반영되도록 `compose.yaml`에 bind mount를 추가했다.
- query client unit test 7건을 추가해 timing, query key, URL encoding, `no-store`, 오류 계약과 retry 범위를 고정했다.

새 package, DB schema, migration, scheduler, 수집·저장·요약 로직과 Release 상세 조회 방식은 변경하지 않았다.

## 3. 발생한 문제와 해결 과정

### 문제 A. Node.js test의 TypeScript parameter property 미지원

**증상:** 첫 `npm.cmd test`에서 `ReleaseQueryError` 생성자의 `readonly status` parameter property를
Node.js strip-only mode가 처리하지 못해 신규 test file이 시작 전에 실패했다.

**조사와 근거:** test 출력에서 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`와 해당 생성자 위치를 확인했다.
같은 시점의 Next.js typecheck는 통과해 Node.js 내장 TypeScript 실행 방식의 차이임을 구분했다.

**원인:** 현재 test command는 별도 TypeScript compiler 없이 `node --test`로 `.ts` 파일을 직접 실행하며,
strip-only mode는 runtime 변환이 필요한 parameter property 문법을 지원하지 않는다.

**해결:** `status`를 일반 class field로 선언하고 생성자 본문에서 대입하도록 변경했다.

**재검증:** 이후 전체 test 24건이 통과했다.

### 문제 B. 기존 Docker web container의 새 디렉터리 미반영

**증상:** `http://127.0.0.1:3000` 브라우저 검수에서 `web/app/latest-release-list.tsx`가
`../components/query-status-panel`을 찾지 못한다는 build error가 표시됐다.

**조사와 근거:** 오류 stack의 실행 경로가 `/app`이었고, 현재 `compose.yaml`은 host의 `web/app`만
container `/app/app`에 bind mount한다. 새 `web/components`와 `web/lib/releases/client.ts`는 기존 image에 없었다.

**원인:** 실행 중인 Docker web container는 `app` 변경은 즉시 보지만 image 생성 후 추가된 `components`와
`lib` 파일은 rebuild 전까지 볼 수 없다.

**해결:** 최초 작업에서는 Docker CLI가 없는 현재 환경에서 host source 전체를 사용하는 로컬 Next.js dev server를
`127.0.0.1:3001`에 실행해 브라우저 검수를 계속했다. 후속 사용자 승인에 따라 `web/Dockerfile`에
`COPY components ./components`를 추가하고, `compose.yaml`에 `./web/components:/app/components`와
`./web/lib:/app/lib` bind mount를 추가했다.

**재검증:** 로컬 dev server에서 최신 카드, technology 목록, 오류 상태와 상세 이동이 정상 표시됐다.
설정 변경 후 web test 24건, typecheck와 production build가 통과했다. 현재 실행 환경에는 Docker CLI가 없어
`docker compose config`, image rebuild와 container runtime은 직접 확인하지 못했으며 성공으로 기록하지 않는다.

### 문제 C. 400·404 응답의 불필요한 기본 retry

**증상:** 잘못된 `page=0` 요청이 400 응답임에도 TanStack Query 기본 retry로 여러 번 호출되어 오류 UI가 늦게 표시됐다.

**조사와 근거:** dev server log에서 동일 400 요청이 반복되는 것을 확인했다.

**원인:** query에 retry 조건을 지정하지 않아 모든 오류에 기본 retry가 적용됐다.

**해결:** `retryReleaseQuery()`를 추가해 4xx는 즉시 종료하고 network·5xx만 제한적으로 retry하게 했다.

**재검증:** unit test로 400, 500과 network 오류의 retry 경계를 확인했고, 브라우저에서 없는 technology의
404 오류가 1초 안에 전용 UI로 표시되는 것을 확인했다.

## 4. 검증 결과와 남은 확인

| 항목 | 방법·환경 | 결과 및 한계 |
| --- | --- | --- |
| unit test | `npm.cmd test` in `web` | 24건 통과, 실패 0 |
| TypeScript | `npm.cmd run typecheck` in `web` | 통과 |
| production build | `npm.cmd run build` in `web` | 성공, `/` static shell과 두 GET dynamic route 생성 확인 |
| diff 형식 | `git diff --check` | whitespace 오류 없음, 기존 Windows line-ending 경고만 존재 |
| 최신 GET API | 로컬 server와 MariaDB, `GET /api/releases/latest` | HTTP 200, 활성 technology 3건과 `Cache-Control: no-store` 확인 |
| technology GET API | `GET /api/technologies/nextjs/releases?page=1` | HTTP 200, Next.js Release 3건과 page 계약 확인 |
| 잘못된 page | `page=0` | HTTP 400과 안전한 JSON 오류, browser 전용 오류 UI 확인 |
| 없는 technology | `technology=missing` | HTTP 404와 안전한 JSON 오류, browser 전용 오류 UI 확인 |
| 최초 client 조회 | Chrome, `http://127.0.0.1:3001` | loading 후 DB 기반 최신 카드 3건 표시 |
| query 상태 | React Query Devtools | 최신 key `['releases','latest']`, technology key `['releases','technology','nextjs',['1']]`과 fresh·inactive 상태 확인 |
| 60초 자동 조회 | active `/` 화면과 dev server log | 최초 성공 후 약 60초에 `/api/releases/latest` HTTP 200 재호출 확인 |
| 상세 회귀 | 목록의 Release 선택 | `/releases/27` 상세와 저장된 요약, 원문·목록 링크 표시 확인 |
| component 길이 | 신규·수정 파일 line count | 가장 긴 신규 파일 178줄, 200줄 이상 신규·수정 파일 없음 |
| Docker source 반영 설정 | `web/Dockerfile`, `compose.yaml` 정적 확인 | `components` image 복사와 `components`·`lib` bind mount 반영 |
| Docker Compose | `docker compose config` | 현재 환경에 Docker CLI가 없어 구성 해석, rebuild와 container 검증 미실행 |

현재 DB의 Next.js Release가 3건이라 20건 초과 pagination과 `keepPreviousData` page 전환은 실제 browser에서
검증하지 못했다. 60초 안의 route 재방문 cache 재사용, background tab에서 polling 중지, 통제된 5xx의 retry 버튼도
자동 test 또는 정적 확인만 수행했으므로 browser 성공으로 간주하지 않는다.

Docker 환경에서는 변경된 image와 mount가 실제 container에 적용되는지 다음 검증이 필요하다.

```sh
docker compose up -d --build web
docker compose exec web sh -lc "test -f /app/components/query-status-panel.tsx"
docker compose logs -f web
```

## 5. 이번 작업에서 얻은 점

- `staleTime`은 데이터를 stale로 판정하는 시간이고, 시간 기반 자동 조회에는 별도의 `refetchInterval`이 필요하다.
- Server Component가 DB 함수를 직접 호출할 때는 목록 API가 필요 없지만 Client Component 전환 후에는 browser와 server 사이의 HTTP 경계가 필요하다.
- `app`만 bind mount한 Docker 개발 구성에서는 새 top-level source directory가 image rebuild 전까지 반영되지 않는다.
- 4xx 입력 오류와 일시적인 network·5xx 오류는 query retry 정책을 구분해야 불필요한 요청과 지연을 막을 수 있다.
- 200줄은 자동 분리 기준보다 책임과 재사용성 점검 기준으로 사용하는 편이 불필요한 component 증가를 막는다.

## 6. 주요 변경 파일

- `web/app/page.tsx`: 메인 DB 직접 조회 제거와 Client Component 배치
- `web/app/latest-release-list.tsx`: 최신 Release TanStack Query 조회와 카드 UI
- `web/app/technologies/[technology]/page.tsx`: DB 직접 조회 제거와 route parameter 전달
- `web/app/technologies/[technology]/technology-release-list.tsx`: page별 query, 이력 목록, 전환·오류 UI
- `web/app/api/releases/latest/route.ts`: 최신 Release GET API
- `web/app/api/technologies/[technology]/releases/route.ts`: technology 이력 GET API와 page 검증
- `web/components/query-status-panel.tsx`: 공용 loading·error·retry UI
- `web/lib/releases/client.ts`: client fetch, query key·timing과 오류·retry 계약
- `web/lib/releases/client.test.ts`: client query 계약 unit test
- `web/Dockerfile`: `components` directory를 web image에 포함
- `compose.yaml`: `components`와 `lib` 개발용 bind mount 추가
- `docs/task_specs/008_TanStack_Query_클라이언트_조회_전환.md`: 구현 상태와 Work Log 연결

## 7. 참고 자료

- [TanStack Query - Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [TanStack Query - Polling](https://tanstack.com/query/latest/docs/framework/react/guides/polling)
- [TanStack Query - Paginated Queries](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)

## 변경 이력

### 2026-09-13 - Docker `components`·`lib` 반영 경로 보완

- 이전: web image는 `app`과 `lib`만 복사하고 Compose는 `app`만 bind mount해 새 `components` module을 container에서 찾을 수 없었다.
- 변경 내역: `web/Dockerfile`에 `components` 복사를 추가하고 `compose.yaml`에 `components`와 `lib` bind mount를 추가했다. web 자동 검증은 통과했으며 Docker CLI 부재로 Compose runtime 검증은 미완료로 유지했다.
