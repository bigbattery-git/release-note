# 005. 최신 GitHub Release 수동 저장

- 작업일: 2026-09-10
- 작업 범위: Next.js, Node.js, React 최신 안정 Release의 수동 수집과 MariaDB 저장
- 기록 기준: Task Spec `docs/task_specs/003_테스트_버튼_최신_기술_Release_저장.md`, 실제 변경 파일과 로컬 검증 결과

## 1. 작업 목적

향후 1분 주기 scheduler에 연결할 수 있도록 GitHub Release 수집과 MariaDB 저장 동작을
웹의 테스트 버튼으로 먼저 구현했다. MariaDB 자체 Release는 수집 대상에서 제외하고,
Next.js, Node.js, React의 최신 안정 Release만 각각 한 건씩 처리했다.

## 2. 수행한 작업과 선택 이유

- `web/migrations/001_create_technology_releases.sql`에 Release table과
  `(technology, external_id)` unique constraint를 정의했다.
- migration script가 기존 MariaDB volume에서도 `release` DB와 table을 준비할 수 있게 했고,
  Docker의 `web` 시작 전에 자동 실행되도록 연결했다.
- GitHub API 응답은 Zod로 검증하고 `draft`, `prerelease`, 발행일이 없는 항목을 제외한 뒤
  `published_at` 기준 최신 항목을 선택했다.
- token이 비어 있으면 `Authorization` header를 보내지 않고, 설정된 경우에만 Bearer token을 사용한다.
- 세 대상의 조회와 검증을 모두 마친 뒤 DB transaction을 시작해 일부 API 실패 시 부분 저장을 방지했다.
- 기존 행과 값이 같으면 건너뛰고, 값이 달라지면 같은 행을 갱신하도록 구현했다.
- Next.js Route Handler는 외부 API 오류와 내부 오류를 안전한 응답으로 변환하며 secret과 stack을 반환하지 않는다.
- Tailwind CSS로 실행 버튼, 실행 중 비활성 상태, 대상별 버전과 저장·갱신·건너뜀 건수를 표시했다.
- `technology-researcher`가 GitHub Releases REST API로 Release를 조회할 수 없는 기술을
  다른 API나 changelog로 대체하지 않고 `수집 불가능`으로 판정하도록 지침을 변경했다.

## 3. 발생한 문제와 해결 과정

### 문제 A. 추적 대상 예제 파일의 secret 형태 값

**증상:** `web/.env.example`에 실제 token과 session secret으로 보이는 값이 있었다.

**원인:** 예제 파일의 placeholder가 실제 값 형태로 교체되어 있었다.

**해결:** 값을 기록하거나 재사용하지 않고 안전한 placeholder로 교체했다. 이미 노출된 token은
파일 수정만으로 무효화되지 않으므로 GitHub에서 revoke 또는 rotate가 필요하다.

**재검증:** 예제 파일에는 실제 secret 대신 placeholder 또는 빈 `GITHUB_TOKEN`만 남았다.

### 문제 B. production build의 DB 환경 변수 오류

**증상:** 최초 `next build`의 page data 수집 단계에서 `DB_HOST 환경 변수가 필요합니다.` 오류가 발생했다.

**원인:** Route module import 시 DB pool을 즉시 생성해 build 시점에도 runtime 환경 변수를 요구했다.

**해결:** DB client를 실제 호출 시점에 생성하는 `getDatabase()` 방식으로 변경했다.

**재검증:** typecheck와 production build가 모두 성공했고 API route는 dynamic route로 생성됐다.

### 문제 C. 3000번 포트의 이전 Docker image

**증상:** 브라우저의 3000번 화면은 새 `app` 파일은 감지했지만 새 `lib/releases` module을 찾지 못했다.

**조사와 근거:** 기존 Compose 구성은 `web/app`만 bind mount하며, 현재 환경에서는 Docker CLI를 사용할 수 없었다.

**원인:** 실행 중인 Docker web container가 새 `lib`와 Dockerfile 변경을 포함하도록 재빌드되지 않았다.

**해결:** 기존 container를 변경하지 않고 최신 host 작업본을 3001번 포트에서 실행해 검수했다.

**재검증:** 3001번에서 `/` GET 200과 `/api/releases/collect` POST 200을 확인했다.
Docker 3000번 환경은 `docker compose up --build` 후 별도 재확인이 필요하다.

### 문제 D. 로컬 의존성 누락

**증상:** 최초 단위 테스트에서 `zod`를 비롯한 lockfile 의존성이 `web/node_modules`에 없었다.

**해결:** 새 package를 추가하지 않고 기존 `package-lock.json` 기준으로 `npm ci`를 실행했다.

**재검증:** 72개 package가 설치됐고 audit 결과는 취약점 0개였다.

## 4. 검증 결과와 남은 확인

| 항목 | 방법·환경 | 결과 및 한계 |
| --- | --- | --- |
| 단위 테스트 | `npm test --prefix web` | 안정판 선택, 응답 거부, 날짜 변환, 변경 판정, 무인증 header, rate limit 오류 등 6개 통과 |
| TypeScript | `npm run typecheck --prefix web` | 성공 |
| production build | `npm run build --prefix web` | 성공, `/` static 및 API dynamic route 생성 |
| migration | 로컬 `127.0.0.1:3306`에서 `npm run db:migrate --prefix web` | `release` DB와 table 적용 성공 |
| 실제 GitHub 조회 | 구현한 수집 함수로 공개 API 호출 | Next.js `v16.3.4`, Node.js `v26.8.2`, React `v19.3.0` 선택 |
| 최초 저장 | 빈 table에서 실제 수집 실행 | 신규 3, 갱신 0, 건너뜀 0 |
| 중복 재실행 | 같은 Release로 두 번째 실행 | 신규 0, 갱신 0, 건너뜀 3, 총 행 수 유지 |
| 수정 정보 갱신 | React 제목을 통제된 값으로 변경 후 재수집 | 갱신 1, 건너뜀 2, 공식 제목 복원과 `updated_at` 변경 확인 |
| 부분 실패 | Node.js path를 존재하지 않는 Repository로 임시 지정 | 실패 전후 DB 3행 유지, 대상 `nodejs` 오류 확인 |
| 안전한 API 오류 | 로컬 3001번 Route Handler에 실패 요청 | HTTP 502와 `Node.js Release 조회에 실패했습니다.`만 반환 |
| 브라우저 UI | Chrome에서 로컬 3001번 화면 직접 검수 | 실행 중 버튼 비활성화·진행 문구, 완료 후 3건 변경 없음과 대상별 버전 표시 확인 |
| 자동 실행 제외 | 코드와 실행 상태 점검 | cron, timer 또는 1분 scheduler 추가 없음 |
| diff 형식 | `git diff --check` | whitespace 오류 없음, Windows line-ending 경고만 존재 |

현재 환경에서 Docker CLI를 찾을 수 없어 변경된 image의 Compose build, migration 자동 실행과
3000번 화면은 검증하지 못했다. Docker Desktop에서 `docker compose up --build` 후 확인해야 한다.

## 5. 이번 작업에서 얻은 점

- Next.js Route Handler가 DB module을 import하더라도 build 시점에 connection을 만들지 않아야 한다.
- `app`만 bind mount하는 Compose 개발 환경에서는 `lib`, migration, Dockerfile 변경 후 image 재빌드가 필요하다.
- 여러 외부 대상을 하나의 작업으로 저장할 때 조회·검증과 transaction 시작 시점을 분리하면 부분 저장을 막을 수 있다.
- 공개 GitHub Release 조회는 token 없이 가능하지만 1분 주기에서는 인증 rate limit이 필요하다.

## 6. 주요 변경 파일

- `web/lib/releases/github.ts`: GitHub Release 조회, 검증과 안정판 선택
- `web/lib/releases/service.ts`: 세 대상 수집, transaction 저장과 실행 중복 병합
- `web/lib/releases/release-comparison.ts`: 기존 행 변경 판정
- `web/app/api/releases/collect/route.ts`: 수동 실행 API와 안전한 오류 응답
- `web/app/release-test-panel.tsx`, `web/app/page.tsx`: 테스트 버튼과 결과 UI
- `web/migrations/001_create_technology_releases.sql`: Release schema와 unique constraint
- `web/scripts/migrate-database.ts`: DB와 schema migration 실행
- `web/lib/database.ts`: typed table과 lazy DB client
- `compose.yaml`, `.env.example`, `web/.env.example`, `web/Dockerfile`: 실행 환경과 secret 예제
- `.agents/subagents/technology-researcher.md`: GitHub Releases REST API 기준 수집 가능성 판정
- `docs/task_specs/003_테스트_버튼_최신_기술_Release_저장.md`: 구현 상태 갱신

## 7. 참고 자료

- [GitHub REST API - Releases](https://docs.github.com/en/rest/releases/releases)
- [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

## 변경 이력

### 2026-09-10 - 기본 technology catalog와 학습 문서 추가

- `technology_releases.technology`를 `ENUM`에서 `VARCHAR(50)`으로 변경했다.
- `default_technologies`에 technology code, 표시명, GitHub Releases path, 활성 상태와 정렬 순서를 관리하고 Release table이 이를 foreign key로 참조하게 했다.
- 수집 service가 hard-coded 대상 목록 대신 활성 catalog 행을 읽도록 변경했다.
- migration runner가 번호순 SQL 파일과 `app_migrations` 적용 이력을 관리하도록 확장했다.
- 유지보수 학습 문서와 `study-note-authoring` skill을 추가했다.
- 실제 DB에서 column type, seed 3건과 foreign key를 확인했고, Node.js를 잠시 비활성화했을 때 수집 대상이 Next.js와 React 두 건으로 줄어든 뒤 활성 상태가 복원되는 것을 검증했다.
