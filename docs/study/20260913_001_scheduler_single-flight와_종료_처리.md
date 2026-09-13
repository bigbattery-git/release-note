# scheduler single-flight와 종료 처리 학습

- 작성일: 2026-09-13
- 대상 기능: 1분 주기 GitHub Release 수집·저장·OpenAI 요약 실행
- 관련 Task Spec: `docs/task_specs/007_scheduler_1분_주기_Release_수집_요약.md`
- 관련 Work Log: `docs/work_logs/009_scheduler_1분_주기_Release_수집_요약.md`

## 1. 학습 목표

이 문서를 학습한 뒤에는 다음 내용을 설명하고 안전하게 수정할 수 있어야 한다.

- scheduler가 왜 `web`의 수집 service를 직접 import하지 않고 HTTP API를 호출하는가?
- `node-cron`의 `noOverlap`이 무엇을 막고 무엇은 막지 못하는가?
- `web`의 `activeCollection`과 DB unique constraint는 각각 어느 단계의 중복을 막는가?
- 5분 timeout과 종료 신호가 진행 중인 `fetch`에 어떤 영향을 주는가?
- scheduler나 web container가 여러 개로 늘어나면 왜 공유 lock을 다시 설계해야 하는가?
- Laravel의 `withoutOverlapping`, `onOneServer`와 현재 구현은 어떤 점이 다른가?

## 2. 구현한 작업

- `scheduler/index.ts`의 cron 표현식을 매초 실행인 `* * * * * *`에서 매분 실행인 `* * * * *`로 변경했다.
- scheduler가 `RELEASE_COLLECTION_URL`의 `POST /api/releases/collect`를 Node.js 기본 `fetch`로 호출하게 했다.
- `node-cron`의 `noOverlap: true`를 적용하고 `execution:overlap` event에서 건너뛴 tick을 기록하게 했다.
- `SCHEDULER_REQUEST_TIMEOUT_MS` 기본값을 `300000ms`, 즉 5분으로 설정했다.
- timeout용 `AbortSignal`과 종료용 `AbortController`를 `AbortSignal.any()`로 결합했다.
- 성공, HTTP 실패, 응답 형식 오류, network 오류, timeout과 겹침을 구분해 secret이나 stack 없는 로그를 남기게 했다.
- `compose.yaml`에서 scheduler에 API URL과 timeout 환경 변수를 전달하고 `web` 시작 이후 scheduler가 시작되게 했다.
- 메인 페이지의 개발용 `ReleaseTestPanel`과 수동 수집 버튼을 제거했다. scheduler가 호출할 API Route는 유지했다.

## 3. 전체 동작 흐름

```text
[node-cron: 매분]
        |
        | noOverlap: 이전 callback 실행 여부 확인
        v
[scheduler/index.ts]
        |
        | POST RELEASE_COLLECTION_URL
        v
[web/app/api/releases/collect/route.ts]
        |
        v
[collectLatestReleases()]
        |
        | activeCollection: 같은 web process의 호출 병합
        v
[GitHub API 조회 -> MariaDB 저장 -> 필요한 Release만 OpenAI 요약]
        |
        v
[(technology, external_id) unique constraint]
```

중복 방지는 한 장치가 전부 담당하지 않는다.

| 계층 | 장치 | 막는 대상 |
| --- | --- | --- |
| scheduler | `node-cron`의 `noOverlap` | 이전 분의 scheduler callback이 끝나기 전 다음 cron callback 시작 |
| web service | `activeCollection` Promise | 같은 web process에 동시에 들어온 여러 수집 요청의 실제 service 중복 실행 |
| MariaDB | `(technology, external_id)` unique constraint | 같은 기술의 같은 Release가 중복 행으로 저장되는 것 |
| 요약 service | 기존 non-null `summary` 확인 | 변경 없는 Release를 OpenAI API로 다시 요약하는 것 |

## 4. 왜 scheduler가 `fetch`로 API를 호출하는가

현재 `scheduler`와 `web`은 별도 `package.json`, Docker image와 Node.js process를 가진다.
`scheduler/index.ts`에서 `web/lib/releases/service.ts`를 직접 import하려면 다음 범위까지 바뀐다.

- Docker build context 밖에 있는 `web` source를 scheduler image에 포함하는 방법
- Kysely, mysql2, OpenAI SDK와 관련 dependency 설치
- DB, GitHub와 OpenAI 환경 변수를 scheduler에도 중복 전달하는 구성
- 두 package가 공유할 code의 위치와 배포 단위

반면 기존 API를 호출하면 Release 처리 책임은 계속 `web`에 남고 scheduler는 “언제 실행할지”만 담당한다.
따라서 이번 구조에서 scheduler는 `activeCollection`을 import하지 않는다. scheduler의 `fetch`가 Route Handler에
도달하고, Route Handler가 `collectLatestReleases()`를 호출할 때 `web` 내부의 `activeCollection`이 사용된다.

## 5. process-local single-flight의 의미

### 5.1 single-flight

single-flight는 같은 작업 요청이 겹쳤을 때 여러 작업을 동시에 시작하지 않고 하나만 실행하는 방식이다.
이번 scheduler에서는 `noOverlap: true`가 이전 cron callback이 진행 중이면 새 tick을 건너뛴다.
`web`에서는 `activeCollection`이 이미 실행 중인 Promise를 다른 요청에도 반환한다.

### 5.2 process-local

process-local은 실행 상태가 현재 Node.js process의 memory 안에만 있다는 뜻이다.

```text
scheduler process A: A의 실행 상태만 알고 있음
scheduler process B: B의 실행 상태만 알고 있음

web process A: A의 activeCollection만 알고 있음
web process B: B의 activeCollection만 알고 있음
```

현재 `compose.yaml`처럼 scheduler와 web이 각각 하나라면 이 범위가 맞는다. 하지만 같은 service를 두 container로
확장하면 각 process가 별도 memory를 가지므로 `noOverlap`과 `activeCollection`만으로는 서로를 막지 못한다.
DB unique constraint는 중복 행을 막아도 중복 GitHub·OpenAI 호출이나 한쪽 요청의 constraint 오류까지 막지는 않는다.

### 5.3 Laravel과 비교

Laravel에서는 이 차이가 framework 기능 뒤에 감춰져 있어 직접 process memory를 의식할 일이 적을 수 있다.

| 목적 | Laravel scheduler | 현재 Node.js 구현 |
| --- | --- | --- |
| 이전 실행과 겹침 방지 | `withoutOverlapping()`이 application cache lock 사용 | `node-cron`의 `noOverlap`이 현재 process의 실행 상태 사용 |
| 여러 server 중 하나만 실행 | `onOneServer()`와 모든 server가 공유하는 central cache 필요 | 구현하지 않음. 현재 단일 scheduler instance만 전제 |
| 같은 HTTP service 호출 병합 | 별도 application lock 또는 멱등성 설계 필요 | 한 web process의 `activeCollection` Promise |

즉 Laravel의 `withoutOverlapping()`은 cache lock을 사용하므로 현재 `node-cron noOverlap`보다 공유 범위가 넓을 수 있다.
Laravel도 여러 server에서 하나만 실행하려면 `onOneServer()`와 공용 cache 구성이 필요하다. 향후 이 프로젝트가
여러 scheduler 또는 web instance로 확장되면 Redis·DB 같은 공유 저장소 기반 lock을 별도 Task Spec으로 설계해야 한다.

## 6. timeout과 종료 처리

### 6.1 5분 timeout

`AbortSignal.timeout(300000)`은 요청 시작 후 5분이 지나면 `fetch`를 중단시킨다. scheduler callback이
영원히 기다리면 `noOverlap` 때문에 이후 모든 분의 tick이 계속 차단될 수 있으므로 유한한 timeout이 필요하다.

5분 안에 작업이 끝나지 않으면 해당 요청은 실패로 기록된다. callback이 종료되어 overlap 상태가 해제되고,
다음 분의 tick에서 새 요청을 시작할 수 있다.

### 6.2 종료 신호

Docker나 운영 환경이 process 종료를 요청하면 일반적으로 `SIGTERM`, 터미널에서 중단하면 `SIGINT`를 받을 수 있다.
현재 signal handler의 순서는 다음과 같다.

1. `shuttingDown = true`로 바꿔 새 작업 시작을 막는다.
2. `task.destroy()`로 cron schedule을 정리한다.
3. 진행 중인 `fetch`가 있으면 `AbortController.abort()`로 scheduler 쪽 대기를 취소한다.
4. scheduler process를 종료한다.

timeout signal과 종료 signal은 `AbortSignal.any()`로 하나의 `fetch` signal에 연결한다. 어느 하나가 먼저 abort되면
요청이 중단된다. timeout과 종료는 로그에서 서로 다른 원인으로 구분한다.

### 6.3 scheduler의 `fetch`를 취소하면 web 작업도 멈추는가

반드시 그렇지는 않다. client인 scheduler가 응답 대기를 취소해도 요청이 이미 `web` Route Handler에 도착했고
GitHub 조회, DB 저장 또는 OpenAI 요청이 시작됐다면 server 작업은 계속될 수 있다. 현재 Route Handler는 들어온
HTTP request의 abort signal을 `collectLatestReleases()`와 하위 외부 호출로 전파하지 않는다.

따라서 종료 시점의 보장은 다음과 같이 구분해야 한다.

- scheduler는 더 이상 새 cron 실행을 시작하지 않는다.
- scheduler는 진행 중 HTTP 응답을 기다리지 않고 종료한다.
- 이미 시작된 web 작업의 즉시 중단은 보장하지 않는다.
- web 작업이 계속되는 동안 새 요청이 같은 web process에 도착하면 `activeCollection`이 기존 Promise를 공유한다.

DB transaction을 강제로 끊는 것보다 server 작업을 정상 완료하게 두는 편이 현재 저장 흐름에는 안전하다.
server-side 취소까지 필요해지면 GitHub·OpenAI·DB 단계별 취소 가능성과 transaction 경계를 별도로 설계해야 한다.

## 7. 환경 변수 흐름

`compose.yaml`의 scheduler 설정은 다음 기본값을 container 환경으로 전달한다.

```text
RELEASE_COLLECTION_URL=http://web:3000/api/releases/collect
SCHEDULER_REQUEST_TIMEOUT_MS=300000
```

`${VARIABLE:-default}` 형식은 shell 또는 루트 `.env`에 값이 없거나 비어 있을 때 기본값을 사용한다.
Docker Compose 안에서 `web`은 container 이름이나 host IP가 아니라 service 이름으로 접근한다.

로컬에서 `node scheduler/index.ts`를 직접 실행하면 Docker Compose가 환경 변수를 넣어주지 않는다.
이 경우 기본 URL은 Docker network용 `http://web:3000/...`이므로 로컬 web 주소를 환경 변수로 직접 전달해야 한다.

## 8. 파일별 책임

| 파일 | 책임 | 수정 시 확인할 영향 |
| --- | --- | --- |
| `scheduler/index.ts` | cron 등록, API 호출, 응답 판정, timeout, overlap log와 종료 처리 | 실행 주기, HTTP 계약, process 종료 |
| `compose.yaml` | scheduler URL·timeout 전달과 service 시작 순서 | container 재생성, 환경별 override |
| `web/app/api/releases/collect/route.ts` | scheduler가 호출하는 server endpoint와 안전한 HTTP 응답 | scheduler 성공·실패 판정 |
| `web/lib/releases/service.ts` | 실제 수집·저장·요약과 `activeCollection` | 중복 요청 병합, DB와 외부 API 흐름 |
| `web/app/page.tsx` | 최신 Release 목록 진입 화면 | 수동 버튼 없이 DB 조회 결과 표시 |
| `web/app/release-test-panel.tsx` | 개발용 수동 실행 UI였으며 이번 작업에서 삭제 | 다시 만들 경우 scheduler와 별개인 관리 기능으로 범위 재확인 |

## 9. 유지보수 시나리오

### 실행 주기를 바꿀 때

- `scheduler/index.ts`의 cron 표현식을 변경한다.
- 겹침 가능성과 GitHub API rate limit 영향을 함께 계산한다.
- 빠른 주기로 임시 변경해 검증했다면 최종 `* * * * *`로 복원한다.

### timeout을 바꿀 때

- 루트 `.env` 또는 실행 환경의 `SCHEDULER_REQUEST_TIMEOUT_MS`를 변경한다.
- 너무 짧으면 정상 OpenAI 요약을 실패로 오인하고, 너무 길면 장애 중 다음 시도가 오래 차단된다.
- Compose service를 재생성하고 startup log의 적용 값을 확인한다.

### scheduler가 HTTP 오류를 반복할 때

1. scheduler log의 HTTP status, timeout 또는 연결 실패 분류를 확인한다.
2. `web` service 준비 상태와 `/api/releases/collect` 응답을 확인한다.
3. web log에서 GitHub, DB 또는 OpenAI 중 실패 경계를 확인한다.
4. secret이나 전체 Release 원문을 임시 log로 출력하지 않는다.

### instance 수를 늘릴 때

- scheduler와 web 각각의 replica 수를 먼저 확인한다.
- process-local 보호만으로 충분하다고 가정하지 않는다.
- 공유 lock의 저장소, lock 만료, crash 후 복구, lock key와 DB transaction 관계를 새 Task Spec으로 정한다.

## 10. 검증 방법과 확인 결과

```sh
npm.cmd run typecheck --prefix scheduler
npm.cmd test --prefix web
npm.cmd run typecheck --prefix web
npm.cmd run build --prefix web
docker compose config
```

- 75초 지연 mock 응답에서 다음 분 tick이 건너뛰어지고, 완료 후 다음 분에 실행이 재개됐다.
- 100ms 통제 timeout에서 실패 후 다음 분에 다시 요청하는 동작을 확인했다.
- 실제 로컬 web endpoint를 scheduler에서 두 주기 호출해 HTTP 200 완료를 확인했다.
- 두 주기 후 DB는 3행이며 중복 key가 없고 최신 3행의 `summary`가 모두 non-null이었다.
- 브라우저에서 수동 수집 버튼이 없고 최신 Release 카드와 상세 이동이 유지되는 것을 확인했다.
- 현재 환경에는 Docker CLI가 없어 `docker compose config`, container 실행과 Linux `SIGTERM` 검증은 수행하지 못했다.
- Windows PTY의 `Ctrl+C`는 wrapper process를 종료해 Node.js signal handler log를 관찰하지 못했다. handler의 실제 동작은 Docker 또는 Linux 환경에서 추가 확인해야 한다.

## 11. 주의사항과 학습 체크리스트

- [ ] `noOverlap`과 `activeCollection`이 서로 다른 process에서 동작한다는 점을 설명할 수 있다.
- [ ] DB unique constraint가 외부 API 중복 호출까지 막지는 못한다는 점을 설명할 수 있다.
- [ ] scheduler가 `collectLatestReleases()`를 직접 import하지 않는 이유를 설명할 수 있다.
- [ ] `AbortSignal.timeout()`과 종료용 `AbortController`의 역할 차이를 설명할 수 있다.
- [ ] client abort 후 server 작업이 계속될 수 있는 이유를 설명할 수 있다.
- [ ] Laravel의 `withoutOverlapping()`과 `onOneServer()`의 차이를 설명할 수 있다.
- [ ] 여러 instance로 확장하기 전에 공유 lock이 필요한지 판정할 수 있다.
- [ ] `.env` override 후 Compose service 재생성과 resolved config 확인이 필요한 이유를 설명할 수 있다.

## 12. 공식 참고 자료

- [node-cron - Scheduling Options](https://nodecron.com/scheduling-options.html)
- [Node.js - `AbortSignal.timeout()`](https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay)
- [Node.js - `AbortSignal.any()`](https://nodejs.org/api/globals.html#static-method-abortsignalanysignals)
- [Docker Docs - Compose variable interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Laravel - Preventing Task Overlaps](https://laravel.com/docs/12.x/scheduling#preventing-task-overlaps)
- [Laravel - Running Tasks on One Server](https://laravel.com/docs/12.x/scheduling#running-tasks-on-one-server)
