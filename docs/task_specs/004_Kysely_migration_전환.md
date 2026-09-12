# 004. Kysely migration 전환

- 작성일: 2026-09-12
- 대상: `web` database migration

## 1. 목표

SQL 파일을 직접 읽어 실행하던 migration을 현재 설치된 Kysely의 migration API와
TypeScript migration 모듈 기반으로 전환한다.

## 2. 요구사항

- `kysely-ctl` 공식 CLI를 devDependency로 설치하고 `kysely.config.ts`를 제공한다.
- 각 migration은 `npx kysely migrate make`가 생성하는 timestamp 파일명과 `up`/`down`
  함수를 사용한다.
- table, column, constraint와 seed 작성에는 Kysely schema/query builder를 사용한다.
- migration 생성과 실행은 `npx kysely migrate make`, `npx kysely migrate latest`로 수행한다.
- 기존 순번형 `kysely_migration` 또는 `app_migrations` 이력이 있는 DB에서도 완료된
  migration을 재실행하지 않는다.

## 3. 완료 조건

- TypeScript typecheck가 통과한다.
- 빈 migration 이력에서 두 migration이 실제 MariaDB에 적용된다.
- 같은 명령을 다시 실행해도 migration이 중복 적용되지 않는다.
- `npx kysely migrate list`가 두 migration을 완료 상태로 표시한다.
- 기존 web test와 production build가 통과한다.

## 4. 제외 범위

- 애플리케이션 DB schema 자체의 변경
- 새 table 또는 Release 수집 기능 추가
- Kysely 또는 MariaDB package 교체
