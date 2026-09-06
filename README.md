# 개발 실행 환경

Node.js 24 기반 스케줄러, Next.js, MariaDB 11.8을 Docker Compose로 실행합니다.
필수 조건: Docker Desktop 설치 및 실행 (Linux containers, Docker Compose v2).
호스트에 Node.js나 MariaDB를 설치할 필요는 없습니다.

```sh
docker compose up --build
```

Next.js 준비 로그가 나오면 http://localhost:3000 에 접근합니다.
이번 단계는 UI 구현 범위가 아니므로 정상 페이지도 빈 화면입니다 (HTTP 200).
Compose가 Next.js 개발 서버를 자동 실행하므로 별도의 `npm run dev`는 필요 없습니다.
소스는 이미지에 복사됩니다. 소스 수정 후 위 명령을 다시 실행해 반영합니다.

## 스케줄링 선택

| 선택지 | 동작 방식 | 장점 | 단점 | 적합도 |
| --- | --- | --- | --- | --- |
| node-cron | 초 단위 cron 표현식으로 콜백 예약 | 간결한 API, 선택 버전의 추가 런타임 의존성 없음 | 프로세스 종료 시 예약 중단 | 높음, 채택 |
| cron | CronJob 객체로 작업 예약 및 제어 | 초 단위 예약, 작업 제어 | 현재 요구에는 설정이 더 많음 | 높음 |
| node-schedule | cron, 날짜, 반복 규칙으로 예약 | 복잡한 날짜 규칙에 유연 | 매초 로그에는 기능이 과함 | 보통 |

`node-cron` 하나만 사용합니다. `* * * * * *`의 첫 필드는 초이며 매초
`수신중`을 출력합니다. 애플리케이션에 `setTimeout`, `setInterval`, 직접 작성한
Timer 반복 루프는 없습니다. 라이브러리 내부의 Timer 사용은 허용하는 해석입니다.
실행 시각은 Node.js 이벤트 루프와 시스템 부하에 따라 지연될 수 있습니다.

공식 자료:
- https://www.nodecron.com/cron-syntax.html
- https://github.com/kelektiv/node-cron
- https://github.com/node-schedule/node-schedule

## 상태 확인 및 종료

```sh
docker compose ps
docker compose logs --timestamps --tail=10 scheduler
docker compose logs --tail=30 mariadb
docker compose exec mariadb healthcheck.sh --connect --innodb_initialized
docker compose down
```

`scheduler`, `web`은 실행 상태, `mariadb`는 `(healthy)` 상태인지 확인합니다.
스케줄러 로그의 `수신중` 출력 간격은 약 1초입니다.
MariaDB 데이터는 named volume에 유지됩니다. 애플리케이션 DB·테이블·초기화 SQL은
만들지 않습니다. MariaDB 자체 구동에 필요한 시스템 DB는 공식 이미지가 초기화합니다.
DB 포트는 호스트에 공개하지 않으며 Compose 내부 주소는 `mariadb:3306`입니다.

기본 root 암호 `local-development-only`는 이 로컬 개발 환경 전용입니다.
필요하면 최초 실행 전에 `.env`에 `MARIADB_ROOT_PASSWORD=원하는암호`를 지정할 수 있습니다.
이미 초기화된 볼륨의 암호는 환경변수 변경만으로 바뀌지 않습니다.

직접 의존성은 scheduler의 `node-cron`, web의 `next`, `react`, `react-dom`뿐입니다.
각 package-lock.json과 `npm ci`로 의존성을 고정합니다.
API, ORM, 업무 기능, 테스트 코드, 배포 및 CI/CD 구성은 포함하지 않습니다.

## 이번 작업의 검증 결과

- 로컬 Node.js 24에서 스케줄러 출력 5회 확인 (간격 987~1009ms).
- Next.js 개발 서버 시작 및 `/` HTTP 200 응답 확인.
- 직접 의존성 목록 확인, npm audit에서 취약점 0개 확인.
- Docker CLI 및 Docker Desktop 기본 설치 경로가 없어 Compose 빌드·기동과
  MariaDB healthy 상태는 아직 검증하지 못했습니다. Docker Desktop 실행 후 위 명령으로 확인해야 합니다.
