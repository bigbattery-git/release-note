# 006. Kysely migration 전환

- 작업일: 2026-09-12
- 작업 범위: SQL migration과 직접 실행 runner를 Kysely 공식 CLI 기반으로 전환
- 기록 기준: Task Spec `docs/task_specs/004_Kysely_migration_전환.md`, 변경 파일과 로컬 검증 결과

## 1. 작업 목적

애플리케이션 query에는 Kysely를 사용하면서 migration은 SQL 파일과 `mysql2` 직접 호출로
관리되던 불일치를 제거한다. Schema 변경과 seed도 TypeScript에서 Kysely API로 관리한다.

## 2. 수행한 작업과 선택 이유

- `kysely-ctl@0.21.0`을 devDependency로 설치하고 `kysely.config.ts`를 추가했다.
- 실제 `npx kysely migrate make`를 실행해 두 timestamp migration 파일을 생성하고 기존
  schema 변경 내용을 `up`/`down`으로 옮겼다.
- DDL은 schema builder, seed는 query builder로 작성했다. MariaDB 고유 `ENUM`, collation,
  `CURRENT_TIMESTAMP(3) ON UPDATE` 표현에만 Kysely `sql` expression을 사용했다.
- Migration 생성·조회·실행 명령을 `kysely-ctl`의 `make`, `list`, `latest`로 통일했다.
- 기존 순번형 `kysely_migration` 또는 `app_migrations` 이력은 timestamp 파일명으로
  변환한다. 기존 schema와 데이터는 변경하지 않고 중복 실행만 방지한다.

## 3. 발생한 문제와 해결 과정

### 문제 A. PowerShell의 npm script 차단

**증상:** `npm run typecheck --prefix web` 실행 시 PowerShell execution policy가
`npm.ps1`을 차단했다.

**원인:** 코드가 아니라 Windows PowerShell의 script 실행 정책 문제였다.

**해결:** 동일한 npm CLI의 Windows 실행 파일인 `npm.cmd`로 검증했다.

**재검증:** `npm.cmd run typecheck --prefix web`가 통과했다.

### 문제 B. Kysely migration import와 MariaDB type 표현

**증상:** 최초 typecheck에서 `Migrator`와 `FileMigrationProvider` import 및 `longtext`
data type에 TypeScript 오류가 발생했다.

**원인:** Kysely 0.29.5는 migration class를 `kysely/migration`에서 import하도록 요구하고,
schema builder의 기본 data type union에는 `longtext`가 없다.

**해결:** migration class import 경로를 수정하고 MariaDB 전용 `longtext`는 Kysely `sql`
expression으로 표현했다.

**재검증:** typecheck와 실제 migration 적용이 통과했다.

### 문제 C. 공식 CLI와 핵심 package의 구분 누락

**증상:** 최초 전환에서는 별도 runner를 만들었고 `npx kysely migrate latest`가 실행되지 않았다.

**원인:** 핵심 `kysely` package와 `kysely` 실행 파일을 제공하는 공식 `kysely-ctl`
package를 구분하지 않고 구현했다.

**해결:** 사용자 확인 후 `kysely-ctl`을 설치하고 공식 config와 CLI 명령으로 교체했다.
파일명도 수동 작성하지 않고 `npx kysely migrate make`로 생성했다.

**재검증:** `npx kysely migrate list`에서 두 파일이 완료 상태로 표시되고,
`npx kysely migrate latest`가 exit code 0으로 완료됐다.

## 4. 검증 결과와 한계 확인

| 항목 | 방법·환경 | 결과 및 한계 |
| --- | --- | --- |
| TypeScript | `npm.cmd run typecheck --prefix web` | 통과 |
| 최초 migration | 로컬 MariaDB에서 `npm.cmd run db:migrate --prefix web` | 두 migration `Success` |
| 재실행 | 같은 migration 명령 재실행 | 추가 실행 결과 없음, 중복 적용 방지 확인 |
| DB 연결 | `npm.cmd run db:check --prefix web` | `MariaDB 연결 확인 완료` |
| 기존 test | `npm.cmd test --prefix web` | 6개 통과 |
| 실제 schema | `information_schema`와 `kysely_migration` read-only 조회 | migration 2개, 대상 table 2개, `VARCHAR(50)` collation, FK와 seed 3건 확인 |
| production build | `npm.cmd run build --prefix web` | 성공, `/` static 및 API dynamic route 생성 |
| 공식 CLI 상태 | `npx.cmd kysely migrate list --no-outdated-check` | timestamp migration 2개 모두 완료 |
| 공식 CLI 실행 | `npx.cmd kysely migrate latest` | exit code 0, 새 migration 없음 |
| 빈 DB migration | 임시 `release_kysely_cli_verification` DB에서 공식 CLI 실행 | 두 migration `Success`, table과 이력 확인 후 임시 DB 제거 |
| Docker Compose | `docker compose config` | 현재 PC에서 Docker CLI를 찾을 수 없어 미검증 |

기존 `app_migrations` 이관 경로는 변환 로직과 typecheck로 확인했으며, 별도의 legacy DB
복제 환경을 만들지는 않았다.

## 5. 이번 작업에서 얻은 점

- Migration 파일 형식뿐 아니라 runner와 적용 이력도 함께 Kysely로 전환해야 일관성이 생긴다.
- 이미 운영된 migration의 이름을 새 provider 이름과 맞추지 않으면 Kysely가 기존 DDL을
  다시 실행할 수 있으므로 legacy 이력 변환이 필요하다.

## 6. 주요 변경 파일

- `web/migrations/1789176662639_create_technology_releases.ts`: Release schema migration
- `web/migrations/1789176664454_create_default_technologies.ts`: catalog, seed와 FK migration
- `web/kysely.config.ts`: 공식 CLI 설정과 기존 migration 이력 호환
- `web/package.json`, `web/package-lock.json`: `kysely-ctl` 고정 및 CLI script
- `README.md`: 현재 migration 실행 방식 안내
- `docs/study/20260910_001_GitHub_Release_수집_유지보수.md`: 학습 문서의 현재 구조 갱신

## 변경 이력

### 2026-09-12 - Kysely 공식 CLI 기준으로 재구성

- 별도 Node runner를 제거하고 `kysely-ctl`과 `kysely.config.ts`를 추가했다.
- 순번형 migration 이름을 실제 `migrate make`가 생성한 timestamp 이름으로 교체했다.
- 기존 적용 이력을 새 파일명으로 변환해 upgrade 시 재실행되지 않게 했다.
