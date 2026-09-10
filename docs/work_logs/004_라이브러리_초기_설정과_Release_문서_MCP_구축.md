# 004. 라이브러리 초기 설정과 Release 문서 MCP 구축

- 작업일: 2026-09-10
- 작업 범위: Kysely 기반 MariaDB 연결, TanStack Query provider와 Devtools, iron-session, bcrypt, Zod, React Hook Form, GitHub Release 구현 문서 MCP
- 기록 기준: Task Spec `docs/task_specs/002_라이브러리_선정과_MCP_구축.md`, 실제 변경 파일과 로컬 검증 결과

## 1. 작업 목적

회원가입·로그인과 Release 수집 기능을 구현하기 전에 DB 접근, client-side server state,
session, password hashing, validation과 Form의 공통 기반을 준비했다. 동시에
`docs/technology_update_api_research.md`를 coding client가 구현 전에 읽을 수 있도록
read-only stdio MCP server로 제공했다.

## 2. 수행한 작업과 선택 이유

### 라이브러리 선택

사용자에게 후보, 영향과 설치 범위를 먼저 제안하고 승인을 받은 뒤 version을 고정했다.

| 영역 | 비교한 후보 | 선택과 이유 |
| --- | --- | --- |
| MariaDB query builder | Kysely, Drizzle ORM, Prisma ORM | schema와 code generation을 먼저 요구하지 않고 `mysql2` pool을 직접 사용할 수 있는 Kysely 선택 |
| client-side server state | TanStack Query, SWR | provider와 전용 Devtools를 함께 제공하는 TanStack Query 선택 |
| session | iron-session, Auth.js | 이번 범위는 인증 provider가 아니라 암호화 cookie session 기반 설정이므로 iron-session 선택 |
| password hashing | bcrypt, bcryptjs, Argon2 | 사용자 선택에 따라 bcrypt와 native 동작 검증 경로 적용 |
| validation과 Form | Zod와 Valibot, React Hook Form과 Formik | 승인된 Zod와 React Hook Form만 설치하고 schema·Form 구현은 보류 |
| MCP | 공식 TypeScript SDK, 독립 custom protocol 구현 | protocol 구현을 직접 유지하지 않도록 공식 MCP v2 server/client package 선택 |

### 애플리케이션 초기 설정

- `web/lib/database.ts`에 환경 변수 기반 `mysql2` pool과 Kysely client를 만들고 개발 중 hot reload에서는 하나의 pool을 재사용하도록 했다.
- `web/scripts/check-database.ts`에 schema를 바꾸지 않는 `SELECT 1` 연결 검사를 추가했다.
- `web/app/providers.tsx`의 `QueryClientProvider`를 root layout에 연결하고 Devtools는 development 조건에서만 render하도록 했다.
- `web/lib/session.ts`에 `SESSION_PASSWORD` 길이 검사, `news-summary-session` cookie와 production 전용 `secure` 설정을 추가했다.
- 현재 session 설정 범위는 공통 `SessionOptions`까지다. 애플리케이션용 `SessionData`, `getIronSession()` helper와 `session.save()`·`session.destroy()`를 호출하는 인증 경로는 회원 schema와 로그인 구현 범위에서 추가해야 한다. 설정을 import하는 것만으로 cookie가 생성되지는 않는다.
- `web/lib/password.ts`에 bcrypt work factor 12의 비동기 hash·verify와 UTF-8 72 bytes 초과 입력 거부를 추가했다.
- Zod와 React Hook Form은 package 설치까지만 수행했다.
- 루트 `.env.example`은 Compose secret을, `web/.env.example`은 web 직접 실행용 DB와 session 환경 변수를 안내하도록 구분했다.

### GitHub Release 문서 MCP

- `mcp/` workspace에 stdio server를 추가했다.
- `news-summary://docs/github-release-implementation-guide` resource와
  `read_github_release_implementation_guide` read-only tool이 source Markdown을 실행 시 직접 읽도록 구성했다.
- verifier가 실제 MCP client process를 띄워 초기화, resource 목록·읽기, tool 목록·호출과 문서 누락 오류 후 process 생존을 확인하도록 했다.
- `news-summary-release-docs`라는 이름으로 Codex 전역 MCP 설정에 절대 경로를 등록했다. 현재 열린 세션이 아니라 다음 Codex 세션부터 사용할 수 있다.

## 3. 발생한 문제와 해결 과정

### 문제 A. TypeScript에서 `.ts` 확장자 import 거부

**증상:** DB 검사 script의 source import에서 `TS5097`이 발생했다.

**조사와 근거:** `tsc --noEmit` 결과로 import 확장자 설정이 원인임을 확인했다.

**원인:** Node.js가 TypeScript source를 직접 실행하는 script와 기존 TypeScript compiler 설정이 일치하지 않았다.

**해결:** `allowImportingTsExtensions`를 활성화하고 emit을 만들지 않는 기존 typecheck 흐름을 유지했다.

**재검증:** `npm run typecheck`가 통과했고 `npm run db:check`와 같은 경로의 Kysely 연결 검사도 성공했다.

### 문제 B. MCP verifier의 resource content union 처리

**증상:** 최초 MCP typecheck에서 resource content의 `text` property 접근이 거부됐다.

**조사와 근거:** SDK 반환형이 text와 blob content의 union인 것을 compiler 오류로 확인했다.

**원인:** text resource라는 runtime 조건을 TypeScript에 좁혀 주지 않았다.

**해결:** `"text" in resourceContent` 검사 후 내용을 비교하도록 변경했다.

**재검증:** MCP typecheck와 실제 stdio protocol verifier가 모두 통과했다.

### 문제 C. sandbox npm cache 접근 거부

**증상:** 최초 `npm ci`에서 사용자 npm cache를 읽지 못해 `EPERM`이 발생했다.

**조사와 근거:** 오류 경로가 workspace 밖의 사용자 npm cache였으며 package나 lockfile 오류는 아니었다.

**원인:** sandbox filesystem 권한으로 외부 cache 접근이 제한됐다.

**해결:** 승인된 설치 범위로 권한을 요청해 양쪽 workspace의 `npm ci`를 다시 실행했다.

**재검증:** web과 mcp 모두 clean install에 성공했고 audit 결과는 0 vulnerabilities였다.

### 문제 D. Docker web image의 dependency 미반영

**증상:** Docker가 실행 중이고 3000 포트도 연결되지만 `/` 요청에서
`Module not found: Can't resolve '@tanstack/react-query'` 오류와 HTTP 500이 반환됐다.

**조사와 근거:** Docker Compose의 `web` container는 3000 포트를 정상적으로 publish하고 있었다.
host에서는 신규 web package가 모두 설치되어 실제 import까지 성공했지만, 3일 전에 생성된
container의 `npm ls --depth=0`에는 Next.js, React, Tailwind CSS 등 기존 package만 있었고
`@tanstack/react-query`를 resolve하지 못했다. `compose.yaml`은 `./web/app`만 `/app/app`에
bind mount하므로 host의 `package.json`, `package-lock.json`과 `node_modules`는 container에 반영되지 않는다.

**원인:** 신규 dependency 설치 후 Docker image를 다시 build하지 않아, container가 dependency 변경 전
image의 `/app/node_modules`를 계속 사용하고 있었다. 포트 접근 실패가 아니라 애플리케이션 module
resolution 실패였다.

**해결:** 원인과 다음 재생성 명령을 확인했다. 이 후속 확인에서는 container를 변경하지 않았다.

```sh
docker compose up -d --build web
```

**재검증:** host 작업본을 별도 3010 포트에서 실행했을 때 `/`는 HTTP 200을 반환했고 모든 신규
package import가 성공했다. Docker web image rebuild와 3000 포트 재검증은 아직 수행하지 않았다.

## 4. 검증 결과와 제한 확인

| 항목 | 방법·환경 | 결과 및 한계 |
| --- | --- | --- |
| clean dependency install | `npm ci` in `web/`, `mcp/` | 양쪽 성공, audit 0 vulnerabilities |
| host package 설치 | `npm ls --depth=0`과 각 package의 실제 ESM import | 승인된 web package가 모두 설치됐고 import 성공 |
| web type | `npm run typecheck` | 성공 |
| production build | `npx next build` | 성공, `/` static render 완료 |
| provider render | `next dev` 3010 포트와 HTTP 요청 | `/` HTTP 200 |
| Devtools production 제외 | production static bundle 문자열 검사 | Devtools package 식별자 없음 |
| MariaDB 연결 | 실행 중인 127.0.0.1:3306에 Kysely로 `SELECT 1` | 성공, schema 변경 없음 |
| session config | 임시 32자 secret과 production 환경으로 module import | cookie 이름과 `secure: true` 확인. `SessionData`, session helper와 cookie 저장 경로는 미구현 |
| password module | 실제 bcrypt hash·verify와 72 bytes 초과 입력 | 정상 입력 성공, 초과 입력 거부 |
| MCP type | `npm run typecheck --prefix mcp` | 성공 |
| MCP protocol | `npm run verify --prefix mcp` | initialize, resource/tool 목록·읽기·호출, 누락 문서 오류 처리 성공 |
| Codex MCP 등록 | `codex mcp get news-summary-release-docs` | enabled stdio server와 절대 경로 확인 |
| Compose 상태와 config | Docker Desktop CLI 절대 경로로 `docker compose ps`, `docker compose config` | web의 3000 포트 publish와 MariaDB healthy 상태 확인 |
| Docker web package | container에서 `npm ls --depth=0`, `require.resolve('@tanstack/react-query')` | 신규 package가 없는 이전 image임을 확인. image rebuild 후 재검증 필요 |
| diff 형식 | `git diff --check` | whitespace 오류 없음, Windows line-ending 경고만 존재 |

`bcrypt`는 clean install에서 npm의 install script 승인 경고가 있었지만, 이어서 실제 native
module import와 hash·verify가 성공했다. 실제 secret은 파일, 로그 또는 문서에 기록하지 않았다.

## 5. 이번 작업에서 얻은 점

- provider 초기 설정 단계에서는 실제 query 정책이 정해지기 전에 `staleTime` 같은 전역 정책을 임의로 두지 않는 편이 안전하다.
- MCP resource는 client가 선택하므로 자연어 기능 요청에서 발견 가능성을 높이려면 동일 문서를 반환하는 명시적 read-only tool을 함께 제공하는 것이 유용하다.
- MCP 검증은 process 실행 여부가 아니라 실제 client handshake와 resource/tool 요청까지 수행해야 한다.
- Compose용 환경 변수와 web 직접 실행용 환경 변수는 서로 다른 `.env.example`에 사용 위치를 명시해야 혼동이 줄어든다.
- 현재 Compose처럼 source 일부만 bind mount하면 host의 dependency 설치는 container에 전달되지 않는다. `package.json`이나 lockfile이 변경될 때는 web image를 다시 build해야 한다.
- `iron-session`의 options 정의와 실제 session cookie 생성은 별개다. 실제 인증 구현에서는 typed session을 가져온 뒤 값을 기록하고 `session.save()`를 호출해야 한다.

## 6. 주요 변경 파일

- `web/lib/database.ts`: Kysely와 MariaDB pool, 연결 검사
- `web/lib/session.ts`: iron-session 공통 설정
- `web/lib/password.ts`: bcrypt hash·verify와 입력 제한
- `web/app/providers.tsx`, `web/app/layout.tsx`: TanStack Query provider와 Devtools 연결
- `web/scripts/check-database.ts`: read-only DB 연결 검사 command
- `web/package.json`, `web/package-lock.json`: 승인된 web dependency와 script
- `mcp/src/server.ts`, `mcp/src/index.ts`: Release 구현 문서 MCP server
- `mcp/src/verify.ts`: stdio MCP protocol verifier
- `mcp/package.json`, `mcp/package-lock.json`: MCP dependency와 검증 script
- `.env.example`, `web/.env.example`, `compose.yaml`: 환경 변수 계약
- `README.md`: 라이브러리, 환경 설정과 MCP 사용 방법
- `docs/task_specs/002_라이브러리_선정과_MCP_구축.md`: 승인된 명세와 완료 상태

## 7. 참고 자료

- [Kysely Getting started](https://kysely.dev/docs/getting-started)
- [MySQL2 documentation](https://sidorares.github.io/node-mysql2/docs/documentation)
- [TanStack Query Devtools](https://tanstack.com/query/latest/docs/framework/react/devtools)
- [iron-session](https://github.com/vvo/iron-session)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Model Context Protocol TypeScript SDK server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)

## 변경 이력

### 2026-09-10 - Docker dependency 오류와 session 설정 범위 보완

- 이전: 3000 포트의 HTTP 500을 기존 개발 process와 임시 검증 server의 포트 충돌로 기록했고, Docker CLI를 사용할 수 없어 Compose 검증을 수행하지 못한 것으로 기록했다. `iron-session`은 공통 option 구성 사실만 기록했다.
- 변경 내역: 실행 중인 Docker Desktop CLI를 찾아 Compose와 container 내부 package를 직접 확인했다. 실제 원인이 dependency 변경 전 Docker image였음을 기록하고, host 설치 상태와 container 설치 상태, 필요한 image rebuild 명령 및 미재검증 상태를 구분했다. 또한 `session.ts`는 options까지만 구성됐으며 cookie 생성에는 typed session helper와 `session.save()` 호출이 추가로 필요하다는 범위를 명시했다.
