---
name: repository-checks
description: 변경된 영역에 맞는 저장소 검증 명령을 선택하고 실행 결과를 근거와 함께 보고할 때 사용한다.
---

# Repository Checks

먼저 변경 파일과 각 패키지의 `package.json`을 확인한다. 변경된 영역에 한해 이미 정의된 검증 명령을 우선 사용한다.

- `mcp/` 변경: 해당 패키지의 typecheck 및 test 스크립트를 확인한다.
- `scheduler/` 변경: 해당 패키지의 typecheck 및 실행 검증 스크립트를 확인한다.
- `web/` 변경: 해당 패키지의 lint, typecheck, build 스크립트를 확인한다.
- Compose 변경: Docker를 사용할 수 있을 때 `docker compose config`로 구성을 검증한다.

존재하지 않는 명령을 임의로 성공 처리하지 않는다. 실행한 명령, 결과, 실행하지 못한 검증과 이유를 최종 보고에 구분해 적는다.
