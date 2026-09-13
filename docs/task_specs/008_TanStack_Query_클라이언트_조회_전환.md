# 008. TanStack Query 클라이언트 조회 전환

- 작성일: 2026-09-13
- 기준: `/`와 `/technologies/[technology]`의 Release 조회를 server-side 직접 조회에서 TanStack Query 기반 client-side 조회로 전환하기 위한 사전 Task Spec
- 관련 문서: `docs/task_specs/002_라이브러리_선정과_MCP_구축.md`, `docs/task_specs/006_기술별_Release_이력_목록_상세_조회.md`, `docs/task_specs/007_scheduler_1분_주기_Release_수집_요약.md`
- 관련 작업 기록: `docs/work_logs/010_TanStack_Query_클라이언트_조회_전환.md`
- 상태: 구현 및 로컬 검증 부분 완료 (`Docker Compose` source 반영 설정 보완 완료, container rebuild·20건 초과 pagination·background polling 중지·60초 내 cache 재방문 검증 제외)

## 1. 목표 (Goal)

`/`와 `/technologies/[technology]`의 `page.tsx`가 MariaDB 조회 함수를 직접 실행하는 현재 구조를 변경한다.
각 페이지는 화면 진입 정보를 Client Component에 전달하고, 실제 Release 데이터는 Client Component가
TanStack Query로 GET API를 호출해 조회한다.

동일한 query 결과는 60초 동안 fresh 상태로 유지해 불필요한 재요청을 줄이고, 화면을 보고 있는 동안에는
60초마다 자동으로 최신 데이터를 다시 조회한다. 재방문·pagination·window focus 등 client interaction에서는
TanStack Query의 cache와 요청 상태 관리 기능을 사용할 수 있게 한다.

여러 화면에서 반복 사용하는 UI는 `web/components/`에서 관리하고, 구현 파일이 200줄 이상으로 길어지면
책임과 재사용성을 기준으로 추가 분리 필요성을 점검해 사용자에게 별도로 알린다.

## 2. 배경

- `web/app/page.tsx`는 Server Component에서 `getLatestTechnologyReleases()`를 직접 호출한다.
- `web/app/technologies/[technology]/page.tsx`는 Server Component에서 `params`, `searchParams`를 해석한 뒤 `getTechnologyReleasePage()`를 직접 호출한다.
- 두 페이지 모두 현재 `dynamic = "force-dynamic"`으로 매 요청마다 server-side DB 조회를 수행한다.
- `web/app/layout.tsx`에는 `AppProviders`가 연결되어 있고, `web/app/providers.tsx`에는 `QueryClientProvider`와 개발 환경용 `ReactQueryDevtools`가 이미 구성되어 있다.
- `@tanstack/react-query`가 설치되어 있지만 현재 Release 조회 화면에는 `useQuery`가 없어 query cache, 중복 요청 제거, client loading·error 상태 관리의 이점을 사용하지 못한다.
- 현재 Release 목록 조회용 공개 GET API는 없다. Server Component였던 두 `page.tsx`는 `web/lib/releases/history.ts`의 DB 조회 함수를 server에서 직접 호출할 수 있었으므로 별도 API가 필요하지 않았다. Client Component는 DB와 server 전용 module을 직접 사용할 수 없으므로 전환 후에는 browser와 server 사이의 GET Route Handler가 필요하다.
- `staleTime`은 자동 갱신 주기가 아니다. `staleTime: 60_000`은 성공한 query 결과를 60초 동안 fresh로 간주할 뿐, 60초가 지난 시점에 요청을 자동으로 시작하지 않는다.
- 화면을 보고 있는 동안 60초마다 자동으로 다시 조회하려면 `refetchInterval: 60_000`이 필요하다. `refetchInterval`은 `staleTime`과 독립적으로 동작하므로 cache freshness와 주기 조회 목적을 각각 충족하도록 두 값을 함께 사용한다.

## 3. 요구사항 (Requirements)

### 3.1 메인 페이지 최신 Release 조회

- `web/app/page.tsx`에서 `getLatestTechnologyReleases()`를 직접 호출하지 않는다.
- `/`의 최신 Release 영역을 담당하는 Client Component를 만들고 해당 component에서 TanStack Query `useQuery`로 데이터를 조회한다.
- client가 호출할 GET API는 기존 `getLatestTechnologyReleases()`를 server에서 실행하고, 현재 `ILatestTechnologyRelease[]` 화면 계약에 필요한 값만 JSON으로 반환한다.
- query key는 최신 Release 목록을 다른 query와 충돌 없이 식별하는 안정적인 값으로 정의한다.
- query의 `staleTime`과 `refetchInterval`을 각각 `60_000ms`로 설정한다.
- 성공 화면은 기존 technology 표시 순서, Release 카드, Release 없음 상태, 상세 목록 이동과 최근 7일 표시를 유지한다.
- 최초 요청 중에는 빈 화면 대신 사용자가 조회 중임을 알 수 있는 loading 상태를 표시한다.
- 요청 실패 시 Release가 없는 정상 상태로 위장하지 않고 retry 가능한 안전한 error 상태를 표시한다.

### 3.2 technology별 Release 목록 조회

- `web/app/technologies/[technology]/page.tsx`에서 `getTechnologyReleasePage()`를 직접 호출하지 않는다.
- `/technologies/[technology]`의 목록을 담당하는 Client Component를 만들고 해당 component에서 TanStack Query `useQuery`로 데이터를 조회한다.
- dynamic route의 `technology`와 URL query의 `page`를 사용해 GET API를 호출한다.
- query key에는 `technology`와 정규화된 `page`를 포함해 technology별·page별 cache가 섞이지 않게 한다.
- query의 `staleTime`과 `refetchInterval`을 각각 `60_000ms`로 설정한다.
- page를 이동하면 URL의 `?page=N`과 query key가 함께 변경되고 해당 page 데이터를 조회한다.
- 기존 page size 20, `created_at DESC, id DESC` 정렬, 21번째 행으로 `hasNext`를 판정하는 server 조회 정책을 유지한다.
- 성공 화면은 기존 Release 항목, 요약 존재 여부, `이전`·`다음` 탐색과 메인으로 돌아가기 링크를 유지한다.
- page 전환 중에는 기존 목록을 유지할 수 있는 TanStack Query 기능을 사용해 불필요한 전체 화면 깜빡임을 줄인다. 이때 이전 page의 항목을 새 page의 확정 결과처럼 표시하지 않도록 전환 중 상태를 구분한다.
- 최초 요청 중에는 loading 상태를, 요청 실패 시에는 retry 가능한 error 상태를 표시한다.
- 잘못된 page 입력과 존재하지 않거나 비활성인 technology는 정상적인 빈 목록과 구분한다.

### 3.3 GET API와 server 경계

- 최신 Release 목록용 GET Route Handler와 technology별 이력 목록용 GET Route Handler를 추가한다.
- Route Handler만 `web/lib/releases/history.ts`의 DB 조회 함수를 호출하며 Client Component는 MariaDB, Kysely와 server 전용 module을 직접 import하지 않는다.
- technology와 page 입력은 server에서 검증한다. page는 기존 `parseReleasePage()`의 양의 정수 규칙을 유지한다.
- 정상 조회는 JSON과 HTTP 200을 반환한다.
- 존재하지 않거나 비활성인 technology와 잘못된 page는 HTTP status와 안전한 JSON 오류 응답으로 정상 목록과 구분한다.
- DB 조회 실패는 빈 배열이나 not-found로 바꾸지 않고 HTTP 5xx의 안전한 오류 응답으로 구분한다.
- 응답에는 DB credential, 환경 변수, 내부 stack, 화면에 필요하지 않은 Release 원문을 포함하지 않는다.
- TanStack Query의 60초 client freshness가 기준이 되도록 GET 응답에 별도의 장기 server cache를 추가하지 않는다.

### 3.4 TanStack Query 동작

- 두 query 모두 `staleTime: 60_000`을 명시적으로 적용한다.
- 두 query 모두 `refetchInterval: 60_000`을 명시적으로 적용해 active observer가 있는 동안 60초마다 자동으로 다시 조회한다.
- background tab에서도 계속 polling하는 동작은 추가하지 않고 `refetchIntervalInBackground`의 기본값 `false`를 유지한다.
- 같은 query key의 동시 조회는 TanStack Query가 하나의 in-flight 요청으로 공유할 수 있어야 한다.
- 성공 후 60초 안에 component가 다시 mount되면 cache된 데이터를 fresh로 사용하고 동일 query의 불필요한 즉시 재요청을 하지 않는다.
- 60초가 지나면 데이터는 stale 상태가 되며, active query는 `refetchInterval`에 따라 자동으로 다시 조회한다.
- 화면을 이탈해 query가 inactive 상태가 되면 주기 조회를 계속하지 않는다. 다시 mount될 때 cache 상태와 TanStack Query 기본 trigger에 따라 조회한다.
- API가 non-2xx를 반환하면 query function이 성공 데이터로 처리하지 않고 오류를 발생시켜 error 상태로 전달한다.
- retry 버튼은 해당 query만 다시 요청하며 전체 browser reload를 요구하지 않는다.

### 3.5 Component 관리와 파일 분리

- 둘 이상의 화면에서 반복 사용하거나 재사용 목적이 분명한 UI component는 `web/components/`에서 관리한다.
- 특정 route에만 종속된 화면 component는 해당 route 가까이에 둘 수 있으며, 재사용되지 않는 모든 component를 형식적으로 `web/components/`로 이동하지 않는다.
- loading, error, retry 또는 Release 표시처럼 두 화면에서 동일한 책임과 UI를 반복하게 되면 공용 component 추출 여부를 우선 점검한다.
- 새로 만들거나 수정하는 파일이 200줄 이상이 되면 책임이 과도하게 섞였는지, 독립적으로 이름 붙일 수 있는 UI·query·상태 처리 단위가 있는지 점검한다.
- 200줄은 자동 분리 기준이 아니라 점검 기준이다. 분리가 유지보수와 재사용성에 유리하면 대상, 이유, 예상 영향을 사용자에게 별도로 알리고 승인된 범위에서 분리한다.
- 길이가 200줄 이상이어도 하나의 응집된 책임을 가지며 분리 이점이 없다면 유지할 수 있고, 그 판단과 이유를 완료 보고에 남긴다.

### 3.6 기존 동작과 UI 유지

- 기존 JSX 구조, 표시 정보, 링크 목적지와 Tailwind CSS styling을 가능한 범위에서 유지한다.
- loading, error, retry와 page 전환 중 상태에 필요한 UI만 추가한다.
- 최근 Release 여부는 기존 server 조회 함수가 DB 현재 시각을 기준으로 계산하는 정책을 유지한다.
- `/releases/[releaseId]` 상세 화면의 server-side 조회 방식은 변경하지 않는다.
- scheduler, `POST /api/releases/collect`, GitHub 수집, MariaDB 저장, OpenAI 요약 로직을 변경하지 않는다.
- 새 library를 설치하지 않고 현재 설치된 `@tanstack/react-query`와 기존 `AppProviders`를 사용한다.

## 4. 완료 조건 (Acceptance Criteria)

| 번호 | Acceptance Criteria |
| --- | --- |
| 1 | `/`의 `page.tsx`가 `getLatestTechnologyReleases()` 또는 다른 DB 조회 함수를 직접 호출하지 않고 Client Component를 렌더링한다. |
| 2 | `/` 최초 진입 시 loading 상태 후 GET API의 DB 기반 최신 Release 결과가 기존 카드 UI에 표시된다. |
| 3 | `/` query에 `staleTime: 60_000`과 `refetchInterval: 60_000`이 적용되고, 성공 후 60초 안의 불필요한 stale-triggered 요청은 줄이면서 화면이 활성 상태일 때 60초 주기 GET 요청이 발생한다. |
| 4 | 최신 Release GET API가 활성 technology별 최신 한 건과 Release 없음 상태를 기존 정렬·응답 계약대로 반환한다. |
| 5 | `/technologies/[technology]`의 `page.tsx`가 `getTechnologyReleasePage()` 또는 다른 DB 조회 함수를 직접 호출하지 않고 Client Component를 렌더링한다. |
| 6 | technology 목록 query key가 `technology`와 `page`를 구분하고 각 조합의 결과가 다른 목록과 섞이지 않는다. |
| 7 | `/technologies/[technology]?page=N`에서 해당 technology의 최대 20건이 기존 정렬 순서로 표시되고 `hasNext`와 현재 page에 따라 `이전`·`다음`이 정확히 표시된다. |
| 8 | page 이동 시 URL과 query key가 함께 변경되며, 전환 중 기존 목록 유지 여부와 loading 상태가 사용자에게 잘못된 page 결과로 인식되지 않게 표현된다. |
| 9 | 이미 조회한 technology·page로 60초 안에 돌아오면 cache된 데이터를 사용하고 불필요한 즉시 stale-triggered GET 요청을 하지 않으며, active 상태에서는 60초 주기 조회를 계속한다. |
| 10 | 두 화면의 API 요청 실패는 Release 없음과 구분되는 error UI로 표시되고 retry 시 browser reload 없이 해당 query가 다시 실행된다. |
| 11 | 잘못된 page, 존재하지 않거나 비활성인 technology, DB 실패가 정상 응답과 구분되는 HTTP status와 안전한 JSON 응답으로 처리된다. |
| 12 | client bundle이 Kysely, DB 연결 정보 또는 server 전용 조회 module을 포함하거나 직접 참조하지 않는다. |
| 13 | `staleTime` 만료 자체가 아니라 `refetchInterval: 60_000`에 의해 active query가 60초마다 재조회되고, background tab 또는 inactive query에서는 polling을 계속하지 않는다. |
| 14 | 기존 최신 카드, Release 없음, 최근 7일 표시, 목록 항목, pagination 링크와 상세 화면 이동 동작이 유지된다. |
| 15 | `/releases/[releaseId]`, scheduler, 수집·저장·요약 로직에는 이번 전환으로 인한 동작 변경이 없다. |
| 16 | 관련 test, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `git diff --check`가 통과한다. |
| 17 | browser Network와 React Query Devtools에서 최초 조회, 60초 fresh cache, active query의 60초 주기 refetch, background·inactive 중 polling 중지, page별 cache와 오류 retry를 확인한다. |
| 18 | 둘 이상의 화면에서 반복 사용하는 UI가 `web/components/`에서 관리되고 route 전용 component와 구분된다. |
| 19 | 새로 만들거나 수정한 200줄 이상 파일마다 분리 필요성을 점검했으며, 분리 대상 또는 유지 사유를 사용자에게 별도로 보고한다. |

## 5. 작업 범위에서 제외하는 항목 (Out of Scope)

- `/releases/[releaseId]` 상세 페이지의 TanStack Query 전환
- Server Component prefetch, `dehydrate`와 `HydrationBoundary`를 사용한 SSR hydration
- Suspense 기반 query로의 전환
- background tab에서 계속되는 polling, 60초보다 짧은 polling 또는 실시간 갱신
- optimistic update, mutation과 수집 API 실행 UI
- query 결과의 localStorage·IndexedDB 영구 저장
- pagination을 infinite query 또는 cursor pagination으로 변경
- Release 조회 SQL, 정렬, page size와 최근 7일 판정 정책 변경
- scheduler, GitHub API, OpenAI API, DB schema와 migration 변경
- 인증·인가, 사용자별 cache와 Repository 관리 기능
- 새 상태 관리 library 또는 fetch wrapper library 설치
- 기존 화면의 전면적인 디자인 변경이나 관련 없는 refactoring

## 6. 제약사항

- Client Component는 GET API만 호출하고 DB에 직접 접근하지 않는다.
- `staleTime`과 `refetchInterval`은 두 query에서 각각 `60_000ms`로 고정한다.
- `staleTime`과 `refetchInterval`을 같은 의미로 취급하지 않는다. 전자는 freshness, 후자는 active query의 주기 조회를 담당한다.
- `refetchIntervalInBackground`는 활성화하지 않는다.
- 기존 `QueryClientProvider`와 개발 환경용 `ReactQueryDevtools` 구성을 유지한다.
- query key는 직렬화 가능하고 입력에 따라 결정적으로 구성한다.
- 공용 component는 `web/components/`, route 전용 component는 해당 route 가까이 두는 기준을 사용한다.
- 200줄 이상 파일은 분리 필요성을 점검하고 판단 결과를 사용자에게 알리되, 줄 수만을 이유로 책임이 불분명한 component를 만들지 않는다.
- 기존 Next.js App Router, React, TanStack Query, Kysely, MariaDB와 Tailwind CSS 구성을 사용한다.
- 새 library, 요청 범위를 넘는 architecture 변경 또는 추가 파일 분할이 필요하면 이유, 대안과 영향 범위를 설명하고 사용자 승인을 받은 뒤 진행한다.
- 구현 및 검증 결과는 별도 Work Log에 한글로 기록한다.

## 7. 확정 사항과 작업 전 확인 사항

### 7.1 사용자 확인으로 확정된 사항

1. **GET API 경계**: 최신 목록은 `/api/releases/latest`, technology별 목록은 `/api/technologies/[technology]/releases?page=N`을 사용한다. 기존에는 Server Component가 DB 조회 함수를 직접 실행해 목록 GET API가 없었으며, Client Component 전환 때문에 새로 필요하다.
2. **Client Component와 공용 component 분리**: `/`의 최신 목록과 `/technologies/[technology]`의 이력 목록은 각각 Client Component로 분리한다. 둘 이상의 화면에서 반복 사용하는 component는 `web/components/`에서 관리하고, route 전용 component는 해당 route 가까이에 둔다. `page.tsx`는 route 입력 전달과 component 배치만 담당한다.
3. **200줄 점검 기준**: 새로 만들거나 수정한 파일이 200줄 이상이면 분리 필요성을 스스로 점검한다. 분리 대상이면 대상·이유·영향을, 유지하면 유지 이유를 사용자에게 별도로 알린다.
4. **pagination UX**: TanStack Query v5의 placeholder data 기능으로 직전 page 데이터를 page 전환 중 유지하되, 전환 중임을 표시하고 navigation 중복 입력을 방지한다.
5. **자동 갱신 범위**: `staleTime: 60_000`은 freshness를 관리하고 `refetchInterval: 60_000`은 active query를 60초마다 자동 조회한다. 두 설정을 함께 사용하고 background tab polling은 활성화하지 않는다.

### 7.2 남은 작업 전 확인 사항

- 현재 남은 사용자 결정 사항은 없다.
- 새 dependency, DB schema 변경과 광범위한 architecture 변경은 예정되어 있지 않다.
- 구현 중 200줄 이상 파일의 추가 분리가 필요하면 7.1의 보고 기준에 따라 사용자에게 별도로 알린다.

## 8. 작업 루프 계획

각 반복은 연결된 Acceptance Criteria를 먼저 정하고 구현·검증을 마친 뒤 다음 단계로 이동한다.

1. **GET API 계약 구성**: 기존 history 조회 함수를 감싸는 두 GET Route Handler와 입력·오류 응답을 구현해 AC 4, 11, 12를 검증한다.
2. **메인 query 전환**: `/` Client Component, query key, query function, loading·error·retry UI, `staleTime`과 `refetchInterval`을 적용해 AC 1~4, 10, 13~14를 검증한다.
3. **technology 목록 query 전환**: route 입력, page별 query key, placeholder data, pagination 상태와 60초 주기 조회를 적용해 AC 5~10, 13~14를 검증한다.
4. **server/client 경계 검증**: client import graph와 API 응답을 점검해 DB module·credential·stack이 client에 노출되지 않는지 AC 11~12를 검증한다.
5. **component 구조 점검**: 반복 UI를 `web/components/`로 분리하고 새로 만들거나 수정한 200줄 이상 파일의 분리 필요성을 점검해 AC 18~19를 검증하고 사용자에게 판단을 보고한다.
6. **회귀 및 browser 검수**: 상세 이동, 최근 표시, scheduler 관련 경계를 확인하고 전체 자동 검증과 browser Network·React Query Devtools 검수를 수행해 AC 14~17을 검증한다.
7. **기록**: Acceptance Criteria별 결과, 실패·원인·수정과 미검증 항목을 Work Log에 기록한다.

각 반복에서 실패하면 원인을 확인하고 같은 범위 안에서 승인된 수정만 수행한다. 같은 원인의 실패가 수정 후 3회 연속 발생하면 반복을 중지한다.

## 9. 검증 방법

### 9.1 자동 검증

- GET API의 정상 응답, 잘못된 page, 없는·비활성 technology와 DB 오류 응답을 검증한다.
- query key가 최신 목록, technology와 page별로 구분되는지 검증한다.
- query function이 non-2xx 응답을 오류로 처리하는지 검증한다.
- 기존 `web/lib/releases/history.test.ts`로 최신·목록 정렬, pagination과 최근 7일 판정 회귀를 확인한다.
- `npm.cmd test`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `git diff --check`

명령은 `web` 또는 저장소의 올바른 working directory에서 실행한다. 현재 client component test 환경이 별도로 없으므로,
새 test library 설치 없이 검증할 수 없는 browser cache 동작은 수동 검수 결과와 한계를 명시한다.

### 9.2 API 검증

- 최신 목록 GET API가 활성 technology 순서, 최신 Release 한 건과 Release 없음 상태를 반환하는지 DB 결과와 대조한다.
- technology 목록 GET API에서 page 1, page 2, 잘못된 page와 없는 technology의 HTTP status·JSON을 확인한다.
- 응답에 DB credential, 환경 변수, 내부 stack과 불필요한 Release 원문이 없는지 확인한다.
- GET 요청만으로 DB write, GitHub API 또는 OpenAI API 호출이 발생하지 않는지 확인한다.

### 9.3 브라우저 수동 검수

- `/` 최초 진입 시 loading 후 최신 카드가 표시되고 Network에 GET 요청 한 건이 발생하는지 확인한다.
- 60초 안에 `/`를 이탈했다가 돌아왔을 때 cache가 즉시 표시되고 동일 query의 불필요한 즉시 GET 요청이 없는지 확인한다.
- 화면을 활성 상태로 유지해 최초 성공 후 약 60초에 `refetchInterval` 요청이 발생하고 최신 결과가 반영되는지 확인한다.
- tab을 background로 전환하거나 해당 화면을 이탈했을 때 60초 polling이 계속되지 않는지 확인한다.
- React Query Devtools에서 query key, fresh·stale 상태, 주기 refetch와 page별 cache를 확인한다.
- technology 목록에서 다음 page로 이동하는 동안 전환 상태가 보이고 새 page 결과가 도착한 뒤 항목과 navigation이 맞는지 확인한다.
- 조회한 이전 page로 60초 안에 돌아가 cache 재사용을 확인한다.
- API 실패를 통제해 error UI와 retry 동작을 확인하고, 빈 목록 상태와 구분되는지 확인한다.
- browser 새로고침과 직접 URL 접근에서 두 화면이 정상 조회되는지 확인한다.
- desktop과 좁은 viewport에서 loading·error·pagination UI가 기존 layout을 깨뜨리지 않는지 확인한다.

## 10. 중지 조건

다음 중 하나에 해당하면 현재 반복을 중지하고 통과·실패한 Acceptance Criteria, 확인한 원인과 필요한 결정을 보고한다.

- 확정한 GET API URL 또는 Client Component 분리 방식을 변경해야 하는 새로운 사유가 발생한다.
- background tab polling 또는 60초와 다른 자동 조회 주기가 요구된다.
- 새 library, DB schema 변경, 추가 architecture 변경 또는 관련 없는 파일 분할이 필요하지만 사용자 승인이 없다.
- 200줄 이상 파일의 점검 결과 추가 분리가 필요하지만 대상·이유·영향을 사용자에게 알리지 못했거나 필요한 승인을 받지 못했다.
- 기존 `/releases/[releaseId]`, scheduler, 수집·저장·요약 로직의 변경이 필요해 Out of Scope를 벗어난다.
- MariaDB 또는 browser를 사용할 수 없어 필요한 실연동·cache 검증을 진행할 수 없다.
- 동일 원인의 구현 또는 검증 실패가 수정 후 3회 연속 반복된다.
- 검증을 위해 실제 Release 삭제 등 복구하기 어려운 조치가 필요하지만 명시적 승인이 없다.

## 11. 완료 조건

다음 조건을 모두 만족할 때만 작업을 성공으로 종료한다.

- AC 1~19가 모두 통과하고 test, typecheck, build, API 응답과 browser 검수 근거가 있다.
- 두 `page.tsx`가 Release DB 데이터를 직접 조회하지 않고 TanStack Query 기반 Client Component가 GET API를 통해 조회한다.
- 두 query에 `staleTime: 60_000`과 `refetchInterval: 60_000`이 적용되고 fresh cache와 active 상태의 60초 자동 refetch를 실제 browser에서 확인했다.
- loading, error, retry, 빈 목록, not-found와 pagination 전환 상태가 서로 구분된다.
- 반복 사용하는 component는 `web/components/`에서 관리하고 200줄 이상 파일의 분리 판단을 사용자에게 별도로 보고했다.
- client bundle과 공개 응답에 server 전용 module, credential, 내부 stack과 불필요한 원문이 노출되지 않는다.
- 기존 최신·이력·상세 탐색, 최근 7일 표시, scheduler와 수집·저장·요약 동작에 회귀가 없다.
- background tab polling, 새 dependency, DB 변경과 Out of Scope 기능이 추가되지 않았다.
- 실행하지 못한 검증은 성공으로 간주하지 않고 사유와 영향을 명시한다.
- 구현 내용, 문제·원인·해결, Acceptance Criteria별 결과와 남은 제한을 Work Log에 기록한다.
