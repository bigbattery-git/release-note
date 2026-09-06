# 002. MariaDB HeidiSQL 접속과 암호 설정

- 작업일: 2026-09-06
- 작업 범위: 로컬 HeidiSQL 접속을 위한 Compose 포트 설정, README 안내, 기존 DB의 암호 설정 동작 정리
- 기록 기준: 작업 대화, `compose.yaml` 및 `README.md` 변경, 파일 검사 결과

## 1. 작업 목적

Docker Compose의 MariaDB를 같은 Windows PC의 HeidiSQL에서 조회할 수 있도록 설정하고, `.env`에 암호를 추가한 뒤 발생한 인증 오류의 원인과 대응 방법을 정리한다.

## 2. 수행한 작업과 선택 이유

- `compose.yaml`의 MariaDB에 `127.0.0.1:3306:3306` 포트 매핑을 추가했다. 로컬 PC에서 접속할 수 있도록 루프백 주소에 바인딩했다.
- README에 `docker compose up -d mariadb` 적용 명령, HeidiSQL 접속 정보, 포트 충돌 및 인증 오류 대응 방법을 추가했다.
- Compose 내부에서는 `mariadb:3306`, HeidiSQL에서는 `127.0.0.1:3306`을 사용하도록 구분했다. HeidiSQL 사용자는 `root`, 포트는 숫자 `3306`이다.

## 3. 발생한 문제와 해결 과정

### 기존 DB 생성 후 환경변수에 지정한 암호로 접속되지 않음

**증상:** 사용자가 `.env`에 `MARIADB_ROOT_PASSWORD`를 추가하고 HeidiSQL로 접속했으나, `Access denied`와 `172.18.0.1`이 포함된 오류가 발생했다고 보고했다. 오류 전문은 확인하지 않았다.

**조사와 근거:** Compose는 `MARIADB_ROOT_PASSWORD` 환경변수를 사용하며, DB 데이터를 `mariadb_data` named volume에 보관한다. 대화에서 기존 DB 생성 이후 `.env`를 추가한 상황을 확인했다.

**원인:** `MARIADB_ROOT_PASSWORD`는 빈 데이터 디렉터리에 DB를 최초 초기화할 때 적용된다. 기존 DB가 있는 상태에서는 `.env`를 추가하거나 바꿔도 저장된 계정 암호가 변경되지 않는다. 이번 오류는 기존 암호와 입력한 암호의 불일치가 유력하며, 실제 인증 검증으로 확정하지는 않았다. 오류에 표시된 `172.18.0.1`은 Docker 네트워크를 통해 서버에 보이는 접속 출발지 주소일 수 있으며, 그 주소만으로 문제라고 판단하지 않는다.

**안내한 해결 방법:** 기존 초기화 당시 암호로 접속한 뒤 `SELECT CURRENT_USER();`로 인증된 계정을 확인하고, 해당 계정에 `ALTER USER`를 실행해 암호를 변경하도록 안내했다. 이후 `.env`와 HeidiSQL의 저장 암호도 같은 값으로 맞춘다. 환경변수 수정이나 컨테이너 재생성만으로 기존 DB 암호가 바뀌지는 않는다. 데이터 보존을 위해 암호 문제 해결 목적으로 볼륨을 삭제하지 않는다.

**재검증:** 사용자는 최초 초기화와 이후 환경변수 변경의 차이를 이해했다고 확인했다. 실제 암호 변경 실행 및 HeidiSQL 재접속 성공은 아직 확인하지 않았다. 실제 암호 값은 기록하지 않는다.

## 4. 검증 결과와 남은 확인

| 항목 | 방법·환경 | 결과 및 한계 |
| --- | --- | --- |
| Compose 및 README 변경 | 에이전트의 파일 확인과 `git diff --check` | 파일 검사 통과 |
| Docker 기동 및 포트 연결 | 에이전트 실행 환경 | Docker CLI를 찾지 못해 직접 검증하지 못함 |
| HeidiSQL 인증 | 사용자 보고 | 인증 오류 발생 보고, 해결 후 접속 성공은 미확인 |

사용자 환경에서 기존 암호로 접속 가능한지 확인하고, 필요한 계정의 암호 변경 후 새 암호로 재접속해야 한다.

## 5. 이번 작업에서 얻은 점

DB 초기화용 환경변수와 이미 저장된 계정 설정을 구분해야 한다. named volume을 유지하는 경우 컨테이너를 다시 만들어도 DB의 기존 암호가 유지되므로, 암호 변경은 DB 계정에 직접 적용해야 한다.

## 6. 주요 변경 파일

- `compose.yaml`: MariaDB의 로컬 접속 포트 매핑 추가
- `README.md`: HeidiSQL 접속 및 기존 볼륨의 암호 동작 안내
- `docs/work_logs/002_MariaDB_HeidiSQL_접속과_암호_설정.md`: 수행 내용과 인증 문제 대응 기록

## 7. 참고 자료

- [Docker 포트 공개](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/)
- [HeidiSQL 연결 도움말](https://www.heidisql.com/help.php)
