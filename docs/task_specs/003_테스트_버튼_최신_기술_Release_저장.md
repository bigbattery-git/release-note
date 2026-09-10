# 003. 테스트 버튼으로 최신 GitHub 기술 Release 저장

- 작성일: 2026-09-10
- 기준: 웹에서 수동으로 최신 Release를 수집·저장하기 위한 사전 Task Spec
- 상태: 구현 및 로컬 Acceptance Criteria 검증 완료

## 1. 목표

사용자가 웹 화면의 테스트 버튼을 한 번 누르면 Next.js, Node.js, React의
최신 안정 Release를 공식 수집원에서 조회하고 MariaDB에 저장한다.

이번 작업은 향후 1분 주기 스케줄링에 재사용할 수 있는 수집·저장 동작을 만드는 데
초점을 두되, 실제 스케줄 등록은 하지 않고 웹 버튼을 수동 실행 진입점으로 사용한다.

## 2. 배경

- 현재 웹은 Next.js App Router로 실행되며 MariaDB 연결용 `Kysely`와 `mysql2`가 설정되어 있다.
- 실제 서비스 DB schema와 migration, Release 수집 및 저장 기능은 아직 없다.
- `docs/technology_update_api_research.md`에 대상별 공식 수집원과 응답 필드가 정리되어 있다.
- Next.js, React, Node.js는 GitHub Releases REST API를 공통 수집원으로 사용할 수 있다.
- 향후 스케줄러가 같은 핵심 동작을 호출할 예정이므로, 버튼에 외부 API 조회와 DB 저장 로직을 직접 결합하지 않아야 한다.

## 3. 요구사항

### 3.1 웹 실행 흐름

- 기본 웹 화면에 `최신 Release 저장 테스트` 버튼을 제공한다.
- 사용자가 버튼을 누르면 server에서 한 번의 수집 작업을 시작한다.
- 작업 실행 중에는 버튼의 중복 입력을 막고 진행 중임을 화면에 표시한다.
- 작업이 끝나면 대상별 조회·저장 결과와 전체 성공 또는 실패 상태를 화면에서 확인할 수 있어야 한다.
- 외부 API token, DB 접속 정보와 상세 오류 stack은 browser에 노출하지 않는다.

### 3.2 수집 대상과 최신 Release 기준

한 번의 실행에서 아래 세 대상의 최신 안정 Release를 각각 한 건씩 선택한다.

| 대상    | 공식 수집원                                 | 식별 기준                    |
| ------- | ------------------------------------------- | ---------------------------- |
| Next.js | GitHub Releases REST API의 `vercel/next.js` | GitHub Release `id`          |
| React   | GitHub Releases REST API의 `react/react`    | GitHub Release `id`          |
| Node.js | GitHub Releases REST API의 `nodejs/node`    | GitHub Release `id`          |

- GitHub 대상은 `draft === false`, `prerelease === false`, `published_at !== null`인 항목만 안정 Release 후보로 취급한다.
- GitHub 대상의 최신 항목은 `published_at`을 우선 기준으로 선택한다.
- 외부 응답은 저장 전에 필수 필드와 값 형식을 server에서 검증한다.

### 3.3 저장 데이터

- 최소한 다음 정보를 Release 레코드에 저장한다.
  - 대상 기술 식별자: `nextjs`, `react`, `nodejs`
  - 외부 수집원의 Release 식별자
  - 버전
  - 제목
  - Release 원문 또는 설명. 원문이 없으면 `null`
  - 공식 원문 URL. 제공되지 않으면 `null`
  - changelog URL. 제공되지 않으면 `null`
  - 외부 Release 발행일
  - 최초 저장 시각과 마지막 갱신 시각
- 같은 기술과 같은 외부 Release 식별자의 조합에는 DB unique constraint를 적용한다.
- `technology_releases.technology`는 `VARCHAR` 문자열로 저장하고 `default_technologies.technology`를 foreign key로 참조한다.
- `default_technologies`에서 technology code, 표시명, GitHub Releases path, 활성 여부와 정렬 순서를 관리한다.
- 실제 수집 대상은 `default_technologies`의 활성 행을 기준으로 결정한다.
- 이미 저장된 Release를 다시 조회하면 새 행을 만들지 않는다.
- 동일한 Release의 원문이나 메타데이터가 바뀐 경우 현재 외부 값을 반영하고 마지막 갱신 시각을 변경한다.
- 한 실행이 새로 저장한 수, 갱신한 수, 변경 없이 건너뛴 수를 구분해 반환한다.

### 3.4 외부 API와 오류 처리

- GitHub API 요청은 기존 환경 변수의 base URL, API version, User-Agent와 대상별 path를 사용한다.
- `GITHUB_TOKEN`이 비어 있으면 `Authorization` header를 보내지 않는다.
- HTTP 오류, rate limit, timeout, 응답 형식 오류와 DB 오류를 성공 또는 업데이트 없음으로 처리하지 않는다.
- 실패 결과에는 사용자가 어느 대상에서 실패했는지 알 수 있는 메시지를 포함하되 secret과 내부 stack은 포함하지 않는다.
- 대상 일부가 실패했을 때 성공한 대상의 저장을 유지할지 전체 저장을 취소할지는 구현 전 확인 사항에서 확정한다.

### 3.5 향후 스케줄링 대비

- 외부 API 조회, 최신 항목 선택, DB 저장으로 이루어진 핵심 동작은 웹 버튼이라는 진입 방식에 의존하지 않아야 한다.
- 향후 scheduler에서 같은 동작을 호출할 수 있어야 하지만, 이번 작업에서는 1분 주기의 자동 실행을 등록하지 않는다.
- 이번 테스트 기능에는 `setInterval`, cron 표현식 또는 별도 반복 실행을 추가하지 않는다.

## 4. 완료 조건 (Acceptance Criteria)

### 사전 조건

- `web`과 `mariadb` service가 실행 중이고 MariaDB가 healthy 상태다.
- Release 저장용 DB와 table이 초기화되어 있다.
- 외부 공식 API에 접근할 수 있으며, 필요한 환경 변수가 설정되어 있다.

| 번호 | Acceptance Criteria                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 웹 화면에 `최신 Release 저장 테스트` 버튼이 보이고, 한 번 누르면 한 번의 수집 작업이 시작된다.                                                |
| 2    | 작업 중에는 진행 상태가 표시되고 같은 버튼을 반복해서 눌러 중복 작업을 시작할 수 없다.                                                        |
| 3    | 정상 실행 후 Next.js, Node.js, React 각각의 최신 안정 Release가 MariaDB에 한 건씩 존재한다.                                                   |
| 4    | 저장된 각 행의 기술 식별자, 외부 Release 식별자, 버전, 제목, 발행일이 비어 있지 않고 공식 API 응답과 일치한다.                                |
| 5    | prerelease, canary, RC, preview 또는 draft 항목은 최신 안정 Release로 저장되지 않는다.                                                        |
| 6    | 같은 최신 Release가 저장된 상태에서 버튼을 다시 눌러도 행 수가 증가하지 않고 결과에 변경 없이 건너뛴 건수가 표시된다.                         |
| 7    | 같은 외부 Release의 수정 가능한 정보가 변경된 경우 새 행을 만들지 않고 기존 행과 마지막 갱신 시각을 갱신한다.                                 |
| 8    | 정상 실행이 끝나면 화면에서 대상별 결과와 신규 저장·갱신·건너뜀 건수를 구분해 확인할 수 있다.                                                 |
| 9    | 외부 API 또는 DB 처리에 실패하면 화면에 실패 대상과 실패 상태가 표시되고 성공으로 오인할 메시지나 유효하지 않은 Release 행이 생성되지 않는다. |
| 10   | 화면 응답과 browser에 노출되는 코드에서 `GITHUB_TOKEN`, DB password 또는 server stack을 확인할 수 없다.                                       |
| 11   | 버튼 실행 기능을 구현한 상태에서도 `web`의 기존 typecheck와 production build가 성공한다.                                                      |
| 12   | 버튼을 누르지 않은 상태에서는 자동 수집이 실행되지 않으며, 1분 주기 scheduler가 등록되어 있지 않다.                                           |

## 5. 작업 범위에서 제외하는 항목

- 1분 주기 또는 다른 주기의 자동 스케줄링
- MariaDB 자체의 Release 수집
- 과거 Release 전체 이력의 최초 동기화
- 사용자가 임의의 GitHub Repository를 등록·수정·삭제하는 기능
- OpenAI API를 이용한 Release 내용 요약
- Release 목록·상세 조회 화면과 알림 기능
- 사용자 인증, 권한 분리와 운영자 전용 접근 제어
- GitHub webhook, retry queue, 분산 lock과 다중 worker 처리
- Node.js 공식 배포 JSON 인덱스의 LTS·보안 정보 결합
- 배포와 production 운영 설정

## 6. 제약사항

- 기존 Next.js, Node.js, MariaDB 기술 구성과 설치된 package를 우선 사용한다.
- UI 디자인과 상태 표시는 Tailwind CSS로 구현한다.
- secret은 환경 변수로만 읽고 저장소, client bundle, 화면 또는 log에 기록하지 않는다.
- 새 라이브러리 설치가 필요하면 이유, 대안과 영향 범위를 설명하고 사용자 승인을 받은 뒤 진행한다.
- DB schema 초기화 방식이나 수집 계층 도입처럼 아키텍처에 영향을 주는 변경은 구현 전에 사용자 승인을 받는다.
- 파일 분할 또는 기존 코드 리팩터링이 필요하면 대상, 이유와 예상 영향을 설명하고 사용자 승인을 받는다.
- 실제 구현과 검증 결과는 별도 Work Log에 기록한다.

## 7. 작업 전 확인 사항

1. **애플리케이션 DB와 schema 초기화 방식**: 현재 `DB_NAME` 기본값이 비어 있고 migration 체계가 없다. 권장안은 `news_summary` DB를 Compose에서 생성하고, version 관리되는 SQL migration으로 Release table과 unique constraint를 만드는 것이다. 이는 DB 초기화 구조 변경이므로 구현 전에 승인이 필요하다.
2. **부분 실패 시 저장 정책**: 권장안은 세 대상의 조회·검증을 먼저 끝낸 뒤 하나라도 실패하면 해당 실행에서는 아무 것도 저장하지 않는 방식이다. 세 대상이 한 시점의 테스트 묶음이라는 점과 결과 판정이 단순하다는 장점이 있다.
3. **테스트 버튼 접근 범위**: 이번 단계에서는 로컬 개발용 공개 버튼으로 가정한다. production 노출 또는 인증이 필요하면 별도 범위와 승인이 필요하다.

## 8. 작업 루프 계획

각 반복은 하나의 검증 가능한 작업 단위만 다루며, 반복 시작 전에 연결된 Acceptance Criteria와 변경 범위를 명시한다.

1. **기반 준비**: 승인된 방식으로 애플리케이션 DB, Release table, unique constraint와 schema 적용 경로를 준비한다.
2. **수집 구현**: Next.js, Node.js, React의 GitHub Release 응답을 조회·검증하고 최신 안정 Release 한 건씩을 선택한다.
3. **저장 구현**: 공통 Release 형태로 변환한 뒤 신규 저장, 기존 행 갱신, 변경 없음 처리를 구현한다.
4. **웹 연결**: 수집·저장 동작을 server 진입점에 연결하고 테스트 버튼, 실행 중 상태와 결과 표시를 구현한다.
5. **실패 처리**: 외부 API, 응답 검증과 DB 실패가 사용자에게 안전하고 구분 가능한 상태로 전달되는지 확인한다.
6. **최종 검증**: 자동 검증과 사용자 관점의 수동 검수를 수행하고 Acceptance Criteria별 근거를 Work Log에 기록한다.

각 반복에서는 변경 후 바로 해당 범위의 검증을 수행한다. 실패하면 원인을 확인하고 같은 범위 안에서 수정 가능한 경우에만 수정·재검증하며, 통과한 조건과 남은 조건을 구분한 뒤 다음 단계로 이동한다.

## 9. 검증 방법

### 9.1 정적·빌드 검증

- `npm run typecheck --prefix web`으로 TypeScript 오류가 없는지 확인한다.
- 저장소에 기존 production build script가 있으면 해당 명령으로 build 성공을 확인한다. script가 없다면 임의로 명령을 단정하지 않고 먼저 package script 추가 필요성을 보고한다.
- 변경 파일에서 client component 또는 browser 응답으로 secret이 전달되지 않는지 코드 경계를 점검한다.

### 9.2 DB 검증

- MariaDB에서 Release table과 `(technology, external_id)` unique constraint가 존재하는지 확인한다.
- 최초 성공 실행 후 기술별 한 행, 총 세 행이 저장되는지 query로 확인한다.
- 같은 최신 Release로 재실행한 뒤 총 행 수가 늘지 않는지 확인한다.
- 동일 식별자의 수정 가능한 데이터를 통제된 입력으로 변경해 upsert와 갱신 시각이 기대대로 동작하는지 확인한다.

### 9.3 외부 응답·선택 규칙 검증

- 각 공식 GitHub endpoint의 응답과 저장된 `external_id`, `version`, `released_at`을 대조한다.
- prerelease 또는 draft가 최신 응답에 함께 있어도 저장 대상으로 선택되지 않는지 검증한다.
- 오류, 빈 배열, 필수 필드 누락과 rate limit 응답을 통제된 방식으로 재현할 수 있으면 실패로 분류되고 유효하지 않은 행이 생기지 않는지 확인한다.

### 9.4 웹 수동 검수

- 브라우저에서 버튼 노출, 단일 실행, 실행 중 비활성화, 대상별 결과와 건수 표시를 확인한다.
- 첫 실행과 재실행을 각각 수행해 화면 결과와 DB query 결과가 일치하는지 확인한다.
- 실패 응답에 token, DB password와 server stack이 포함되지 않는지 browser Network 응답까지 확인한다.
- 버튼을 누르지 않고 대기했을 때 자동 수집이 실행되지 않는지 확인한다.

## 10. 중지 조건

다음 중 하나에 해당하면 현재 반복을 중지하고, 충족한 조건·실패한 조건·확인한 원인·시도한 조치와 필요한 사용자 결정을 보고한다.

- 새 라이브러리 설치 또는 교체가 필요하지만 사용자 승인이 없다.
- DB 초기화 구조, 수집 계층 또는 파일 분할·리팩터링처럼 사전 승인이 필요한 변경이 발생한다.
- 부분 실패 저장 정책처럼 결과를 바꾸는 미확정 요구사항이 결정되지 않았다.
- 실제 secret, 외부 API 접근, MariaDB 실행 환경 또는 사용자 권한이 없어 다음 검증을 진행할 수 없다.
- 동일한 원인의 검증 실패가 수정 후 3회 연속 반복된다.
- 다음 변경이 이 Task Spec의 요구사항을 벗어나거나 Out of Scope 항목을 필요로 한다.
- 검증을 위해 실제 데이터 삭제 등 복구하기 어려운 조치가 필요하지만 명시적 승인이 없다.

## 11. 완료 조건

다음 조건을 모두 만족할 때만 작업 루프를 성공으로 종료한다.

- Acceptance Criteria 1~12가 모두 통과하고 각 항목의 검증 근거가 있다.
- Next.js, Node.js, React 외의 기술 Release를 수집하지 않는다.
- 최초 실행, 중복 재실행, 수정한 정보 갱신과 대표 실패 흐름의 DB·화면 결과를 확인했다.
- typecheck와 가능한 production build가 성공했다. 실행하지 못한 검증은 완료로 간주하지 않고 사유를 명시한다.
- 1분 주기 scheduler, OpenAI 요약과 과거 이력 전체 동기화 등 Out of Scope 기능이 추가되지 않았다.
- 임시 검증 코드, 실제 secret과 불필요한 의존성이 남아 있지 않다.
- 구현 내용, 문제와 해결 과정, Acceptance Criteria별 결과 및 미검증 항목을 Work Log에 기록했다.
