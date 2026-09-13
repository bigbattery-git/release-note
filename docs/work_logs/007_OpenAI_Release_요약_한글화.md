# 007. OpenAI Release 요약·한글화

- 작업일: 2026-09-13
- 작업 범위: GitHub Release 원문의 OpenAI 요약·한글화, MariaDB 저장, 부분 성공 응답과 메인 페이지 출력
- 기록 기준: Task Spec `docs/task_specs/005_OpenAI_Release_요약_한글화_출력.md`, 변경 파일과 로컬 실연동 검증 결과

## 1. 작업 목적

기존 GitHub Release 수집의 `inserted`, `updated`, `skipped` 판정을 유지하면서
`technology_releases.description`을 개발자가 읽기 쉬운 한글 bullet로 요약한다.
요약은 `technology_releases.summary`에 저장하고 현재 메인 페이지의 기술별 결과 카드에 표시한다.

## 2. 수행한 작업과 선택 이유

- `technology_releases.summary` nullable `LONGTEXT` column을 새 Kysely migration으로 추가했다.
- `openai@7.15.0`을 고정 설치하고 OpenAI Responses API와 Structured Outputs를 사용했다.
- API key는 사용자 정의 환경 변수 `OPENAI_API_SECRET_KEY`, model은 `OPENAI_MODEL`에서 읽는다.
  실제 model은 `gpt-5.6-terra`로 검증했다.
- `max_output_tokens`는 `2,000`, `reasoning.effort`는 `none`, `store`는 `false`로 설정했다.
- 일반 Release는 3~5개, 변경이 많은 Release는 중요 주제별 최대 10개 bullet이 되도록 prompt와
  Zod schema를 함께 적용했다. 저장 형식은 각 항목을 `- `로 시작하는 plain Markdown text로 정했다.
- Release 저장 transaction을 먼저 완료한 뒤 OpenAI API를 호출한다. 외부 API 지연 동안 DB transaction을
  유지하지 않고, 요약 실패가 이미 성공한 Release 저장을 rollback하지 않게 하기 위한 선택이다.
- 동일 Release의 `description`이 변경되면 기존 `summary`를 `NULL`로 무효화하고 다시 생성한다.
  title, URL 등 다른 metadata만 변경되면 기존 요약을 보존한다.
- 기술별 `summaryStatus`로 `generated`, `preserved`, `not_applicable`, `failed`를 반환하고,
  `summaryFailed` 집계를 추가해 Release 저장 성공과 요약 실패를 부분 성공으로 표현한다.
- 현재 메인 페이지 결과 카드에 저장 상태, 요약 상태와 저장된 한글 요약을 Tailwind CSS로 표시한다.
- `compose.yaml`이 optional `web/.env`를 `web` container에 전달하게 하고,
  `docs/tech/OpenAI_Release_요약_환경설정.md`에 환경 변수와 model 변경 방법을 정리했다.

## 3. 발생한 문제와 해결 과정

### 문제 A. PowerShell의 npm script 차단

**증상:** `npm install openai --save-exact`가 `npm.ps1` execution policy 오류로 실행되지 않았다.

**원인:** 애플리케이션이나 package 문제가 아니라 Windows PowerShell이 `npm.ps1` 실행을 차단했다.

**해결:** 동일한 npm CLI의 Windows 실행 파일인 `npm.cmd install openai --save-exact`를 사용했다.

**재검증:** `openai@7.15.0` 설치, `package.json`과 `package-lock.json` 갱신 및 audit 0 vulnerabilities를 확인했다.

### 문제 B. 제한된 network에서 GitHub 수집 실패

**증상:** 최초 로컬 개발 서버의 `/api/releases/collect` 요청이 HTTP 502를 반환했다.

**조사와 근거:** server route는 약 2.2초 후 GitHub 오류용 HTTP 502 경로로 종료됐고,
같은 코드를 network 접근이 허용된 개발 서버에서 실행하자 GitHub와 OpenAI 요청이 모두 성공했다.

**원인:** 최초 개발 서버 process의 제한된 network 환경 때문에 외부 GitHub API에 연결하지 못했다.

**해결:** 사용자 승인 범위에서 network 접근이 가능한 로컬 개발 서버를 3001번 포트로 다시 실행했다.

**재검증:** 실제 `/api/releases/collect`가 HTTP 200을 반환하고 세 Release 요약을 생성·저장했다.

### 문제 C. Docker CLI 부재

**증상:** `docker compose config`가 `docker` 명령을 찾지 못해 실행되지 않았다.

**원인:** 현재 shell PATH와 확인한 기본 설치 경로에서 Docker CLI를 찾을 수 없었다.

**해결:** Compose 파일은 정적 검토하고 local Next.js·MariaDB 환경에서 기능을 검증했다.

**재검증:** Docker Compose container 검증은 수행하지 못했으며 남은 확인 사항으로 유지한다.

## 4. 검증 결과와 남은 확인

| 항목 | 방법·환경 | 결과 및 한계 |
| --- | --- | --- |
| SDK 설치 | `npm.cmd install openai --save-exact` | `openai@7.15.0`, audit 0 vulnerabilities |
| TypeScript | `npm.cmd run typecheck` in `web` | 통과 |
| unit test | `npm.cmd test` in `web` | 14개 통과, 실패 0 |
| production build | `npm.cmd run build` in `web` | 성공, `/` static 및 `/api/releases/collect` dynamic route 생성 |
| DB 연결 | `npm.cmd run db:check` in `web` | `MariaDB 연결 확인 완료` |
| migration 최초 적용 | `npm.cmd run db:migrate` in `web` | `1789265068288_add_release_summary` `Success` |
| migration 재실행 | 같은 명령 재실행 | 새 migration 없음, 중복 적용되지 않음 |
| 실제 schema | 로컬 MariaDB `information_schema.COLUMNS` read-only 조회 | `summary`, `longtext`, nullable `YES` |
| 실제 OpenAI 연동 | network 허용 로컬 server에서 수집 API 실행 | Next.js, Node.js, React 3건 모두 `generated`, `summaryFailed: 0` |
| 저장 결과 | 로컬 MariaDB read-only 조회 | 세 기술의 `summary`가 모두 non-null, 각각 326·451·1497 characters |
| 중복 호출 방지 | 같은 API 즉시 재실행 | 세 기술 모두 `skipped` + `preserved`, `summaryFailed: 0` |
| browser 검수 | Chrome에서 `http://127.0.0.1:3001` 버튼 실행 | 저장 집계, `기존 요약` badge와 세 한글 요약 표시 확인 |
| secret 검사 | `.env`, `.git`, `.next`, `node_modules`를 제외한 workspace scan | 실제 API key 일치 파일 0개 |
| diff 검사 | `git diff --check` | 통과 |
| Docker Compose | `docker compose config` | Docker CLI 부재로 미검증 |

실제 `description` 변경을 GitHub에 발생시키지는 않았다. 해당 분기는
`hasReleaseDescriptionChanged` unit test와 service update code로 검증했으며, 실제 외부 Release 수정 시의
재생성은 후속 운영 관찰 대상이다. 요약 실패 부분 성공은 dependency를 주입한 unit test로 검증했다.

## 5. 이번 작업에서 얻은 점

- OpenAI 호출을 DB transaction 밖에서 수행하면 외부 응답 지연과 Release 저장 성공 여부를 분리할 수 있다.
- model 출력 길이는 prompt만으로 제한하지 않고 Structured Outputs의 `maxItems`와
  `max_output_tokens`를 함께 적용해야 저장 형식을 안정적으로 유지할 수 있다.
- 같은 GitHub Release ID의 `body`가 수정될 수 있으므로 `description` 변경만 요약 무효화 조건으로 사용해야 한다.
- package 변경 후 Docker 환경에서는 host 검증과 별도로 `web` image rebuild와 container 내부 dependency 확인이 필요하다.

## 6. 주요 변경 파일

- `web/migrations/1789265068288_add_release_summary.ts`: `summary` column migration
- `web/lib/database.ts`: Kysely Release table type에 `summary` 추가
- `web/lib/releases/summary.ts`: OpenAI SDK client, prompt, Structured Outputs와 응답 검증
- `web/lib/releases/service.ts`: Release 저장 후 요약, 무효화, 부분 성공 처리
- `web/lib/releases/types.ts`: 요약 내용·상태와 실패 집계 API type
- `web/lib/releases/release-comparison.ts`: `description` 변경 판정
- `web/lib/releases/summary.test.ts`, `web/lib/releases/service.test.ts`, `web/lib/releases/github.test.ts`: 요약과 회귀 test
- `web/app/release-test-panel.tsx`: 요약 상태와 저장된 요약 출력
- `web/package.json`, `web/package-lock.json`: `openai@7.15.0`
- `web/.env.example`, `compose.yaml`: OpenAI 환경 변수 예시와 Docker 전달
- `docs/tech/OpenAI_Release_요약_환경설정.md`: 환경 변수와 model 운용 문서
- `docs/task_specs/005_OpenAI_Release_요약_한글화_출력.md`: 확정된 구현·검증 기준

## 7. 참고 자료

- [OpenAI API Reference - Create a model response](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [OpenAI API - GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
