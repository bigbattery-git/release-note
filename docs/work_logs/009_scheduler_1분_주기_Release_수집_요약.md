# 009. scheduler 1분 주기 Release 수집·요약

- 작업일: 2026-09-13
- 작업 범위: scheduler의 1분 주기 수집 API 호출, 실행 겹침 방지, timeout·종료 처리와 개발용 수동 버튼 제거
- 기록 기준: Task Spec `docs/task_specs/007_scheduler_1분_주기_Release_수집_요약.md`, 변경 파일, mock·로컬 실연동·브라우저 검증 결과

## 1. 작업 목적

기존 웹 수동 버튼으로 실행하던 GitHub Release 수집·MariaDB 저장·OpenAI 요약 흐름을
별도 scheduler service가 매분 자동 실행하게 했다. 이전 실행이 1분 안에 끝나지 않아도 다음 tick이
새 요청을 겹쳐 시작하지 않게 하고, 자동 실행으로 대체된 개발용 수동 수집 UI를 제거했다.

## 2. 수행한 작업과 선택 이유

- `scheduler/index.ts`의 cron을 `* * * * *`로 바꿔 매분 실행하게 했다.
- scheduler는 Node.js 기본 `fetch`로 기존 `POST /api/releases/collect`를 호출한다. web의 DB·GitHub·OpenAI
  dependency를 scheduler에 복제하지 않고 기존 service와 `activeCollection`을 재사용하기 위한 선택이다.
- 이미 설치된 `node-cron` 4.6의 `noOverlap: true`를 사용했다. 이전 callback이 실행 중이면 다음 tick을
  건너뛰며 `execution:overlap` event에서 운영자가 확인할 수 있는 로그를 남긴다.
- `AbortSignal.timeout()`과 `AbortSignal.any()`로 기본 5분 timeout을 적용했다.
- `SIGINT`, `SIGTERM`을 받으면 cron task를 정리하고 진행 중 scheduler HTTP 요청을 취소하도록 했다.
- HTTP status, 응답의 `success`와 `warnings` 형식을 확인하며 실패·timeout·network 오류를 성공으로 기록하지 않는다.
- 오류 log에는 response body, request header, 환경 변수 전체와 stack을 출력하지 않는다.
- `compose.yaml`에서 `RELEASE_COLLECTION_URL`과 `SCHEDULER_REQUEST_TIMEOUT_MS`를 scheduler container에 전달하고,
  `web` service가 시작된 뒤 scheduler가 시작되게 했다.
- `web/app/page.tsx`에서 `ReleaseTestPanel`을 제거하고 더 이상 사용하지 않는
  `web/app/release-test-panel.tsx`를 삭제했다. 최신 Release 목록과 상세 화면은 유지했다.
- 구현 구조, process-local 한계, Laravel 비교와 종료 동작을
  `docs/study/20260913_001_scheduler_single-flight와_종료_처리.md`에 정리했다.

새 package 설치, Release service 이동, 공용 package 추출과 분산 lock은 추가하지 않았다.
기존에 수정되어 있던 `.env.example`, `web/.env.example`도 덮어쓰지 않았다.

## 3. 발생한 문제와 해결 과정

### 문제 A. 1분보다 오래 걸리는 실행의 중복 가능성

**증상:** 단순히 매분 async callback을 등록하면 이전 HTTP 요청이 끝나기 전에 다음 callback이 시작될 수 있다.

**조사와 근거:** 설치된 `node-cron` 4.6의 type과 공식 문서에서 `noOverlap` option과
`execution:overlap` event를 확인했다.

**원인:** 실행 주기는 시작 간격일 뿐 이전 실행 완료를 자동으로 기다린다는 보장이 없기 때문이다.

**해결:** cron task에 `noOverlap: true`를 적용하고 overlap event를 안전한 log로 기록했다.

**재검증:** 75초 후 응답하는 mock endpoint를 사용했다. `07:29:00` 첫 요청 후 `07:30:00` tick이
건너뛰어졌고 mock server 요청 수는 한 건이었다. 첫 요청이 `07:30:15`에 끝난 뒤 `07:31:00`에
두 번째 요청이 시작됐다.

### 문제 B. 영구 대기 시 모든 후속 tick 차단

**증상:** HTTP 요청이 끝나지 않으면 `noOverlap`이 이후 실행을 계속 건너뛸 수 있다.

**원인:** 실행 중 상태를 해제하려면 callback이 성공 또는 실패로 종료되어야 한다.

**해결:** 기본 `300000ms` timeout을 적용하고 timeout도 안전한 실패로 종료되게 했다.

**재검증:** timeout을 통제 목적으로 `100ms`로 낮추고 5초 지연 endpoint를 호출했다.
`07:32:00` timeout 후 `07:33:00`에 새 요청이 다시 시작되어 timeout 뒤 복구를 확인했다.

### 문제 C. 제한된 network의 실제 GitHub 조회 실패

**증상:** 제한된 로컬 개발 server에서 scheduler 요청은 web에 도달했지만 HTTP 502를 반환했다.

**조사와 근거:** scheduler log에는 HTTP 502, web log에는 `POST /api/releases/collect 502`가 기록됐다.

**원인:** 최초 web server process가 외부 GitHub API에 접근할 수 없는 실행 환경이었다.

**해결:** 승인된 network 접근 환경에서 같은 로컬 web server를 다시 실행했다.

**재검증:** scheduler가 `07:39:00`, `07:40:00` 두 주기에 실제 endpoint를 호출했고 각각 약 3.4초와
2.5초 후 HTTP 200 성공으로 완료됐다.

### 문제 D. Docker CLI와 signal 검증 환경 부재

**증상:** `docker compose config`가 `docker` 명령을 찾지 못해 실행되지 않았다. Windows PTY에서 보낸
`Ctrl+C`는 wrapper process를 exit code 1로 종료했지만 Node.js signal handler log는 반환하지 않았다.

**원인:** 현재 shell PATH에 Docker CLI가 없고, Windows PTY의 control signal 전달이 Linux container의
`SIGTERM` 전달과 같지 않아 handler 실행을 관찰할 수 없었다.

**해결:** Compose 파일은 정적으로 검토하고 scheduler TypeScript 검사를 통과시켰다. signal handler에는
기존 `process.once` 구조를 유지하면서 cron 정리와 HTTP abort를 연결했다.

**재검증:** Docker Compose 기동과 실제 `SIGTERM` handler log는 확인하지 못했다. Docker 사용 환경에서
후속 검증해야 하며 성공으로 기록하지 않는다.

## 4. 검증 결과와 남은 확인

| 항목 | 방법·환경 | 결과 및 한계 |
| --- | --- | --- |
| scheduler TypeScript | `npm.cmd run typecheck --prefix scheduler` | 통과 |
| web unit test | `npm.cmd test --prefix web` | 17개 통과, 실패 0 |
| web TypeScript | `npm.cmd run typecheck --prefix web` | 통과 |
| web production build | `npm.cmd run build --prefix web` | 성공, `/api/releases/collect` dynamic route 유지 |
| DB 연결 | `npm.cmd run db:check` in `web` | `MariaDB 연결 확인 완료` |
| overlap 방지 | 75초 지연 local mock, 실제 분 tick | 중간 tick 건너뜀, 완료 후 다음 분 재개 |
| timeout 복구 | 100ms timeout, 5초 지연 local mock | 두 연속 분에서 각각 timeout 후 재실행 |
| 초기 web 미준비·실패 | 제한된 network의 local web | HTTP 502를 실패로 기록하고 scheduler 유지 |
| 실제 scheduler→web | network 허용 local web, 두 분 주기 | 두 번 모두 HTTP 200 완료 |
| DB 중복·요약 | 두 실제 주기 후 read-only 조회 | 총 3행, 중복 key 0, 최신 세 행 모두 요약 있음 |
| 브라우저 UI | Chrome, `http://127.0.0.1:3001` | 수동 버튼 없음, 최신 Release 카드와 상세 이동 유지 |
| 설정 오류 | `SCHEDULER_REQUEST_TIMEOUT_MS=invalid` | secret·stack 없이 설정 오류 log 후 exit 1 |
| diff 형식 | `git diff --check` | whitespace 오류 없음, Windows line-ending 경고만 존재 |
| Docker Compose | `docker compose config` | Docker CLI 부재로 미검증 |
| 종료 signal | Windows PTY `Ctrl+C` | wrapper 종료만 확인, handler log와 Linux `SIGTERM` 미검증 |

Docker가 있는 환경에서 다음 검증이 남아 있다.

```sh
docker compose config
docker compose up --build
docker compose ps
docker compose logs -f scheduler
```

두 번 이상의 실제 분 주기와 `docker compose stop scheduler` 시 종료 log를 확인해야 한다.
잘못된 JSON과 `success: false` mock 응답은 code 검토와 typecheck만 수행했으며 실제 cron tick으로 재현하지 않았다.
따라서 구현은 완료했지만 Task Spec의 전체 Acceptance Criteria가 모두 실증된 상태로 기록하지 않는다.

## 5. 이번 작업에서 얻은 점

- 1분 cron은 “1분 간격 시작”을 뜻하므로 실행 시간이 1분보다 길 수 있으면 overlap 정책이 별도로 필요하다.
- scheduler, web과 DB의 중복 방지는 서로 다른 단계에 적용되며 하나만으로 전체 중복을 막는다고 볼 수 없다.
- client `fetch` 취소는 이미 시작된 server-side 작업 취소를 보장하지 않는다.
- Laravel의 cache lock 기반 scheduler와 process-local `node-cron noOverlap`은 보장 범위가 다르다.
- 제한된 network에서 Route 호출이 실패한 결과와 실제 외부 API 연동 실패를 구분해 재검증해야 한다.

## 6. 주요 변경 파일

- `scheduler/index.ts`: 매분 API 호출, 응답 검증, `noOverlap`, timeout, signal과 운영 log
- `compose.yaml`: scheduler 환경 변수와 `web` 시작 의존성
- `web/app/page.tsx`: 개발용 수동 수집 panel 제거
- `web/app/release-test-panel.tsx`: 더 이상 필요하지 않은 개발용 UI 삭제
- `docs/task_specs/007_scheduler_1분_주기_Release_수집_요약.md`: 구현 상태와 관련 Work Log 반영
- `docs/study/20260913_001_scheduler_single-flight와_종료_처리.md`: scheduler 구조와 Laravel 비교 학습 문서

## 7. 참고 자료

- [node-cron - Scheduling Options](https://nodecron.com/scheduling-options.html)
- [Node.js - `AbortSignal.timeout()`](https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay)
- [Node.js - `AbortSignal.any()`](https://nodejs.org/api/globals.html#static-method-abortsignalanysignals)
- [Docker Docs - Compose variable interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Laravel - Task Scheduling](https://laravel.com/docs/12.x/scheduling)
