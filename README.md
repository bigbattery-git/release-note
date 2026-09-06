# 개발 실행 환경

Node.js 24 기반 스케줄러, Next.js, MariaDB 11.8을 Docker Compose로 실행합니다.
필수 조건: Docker Desktop 설치 및 실행 (Linux containers, Docker Compose v2).
호스트에 Node.js나 MariaDB를 설치할 필요는 없습니다.

```sh
docker compose up --build
```

Next.js 준비 로그가 나오면 http://localhost:3000 에 접근합니다.
현재 페이지에는 `Hello, World!`가 표시됩니다 (HTTP 200).
Compose가 Next.js 개발 서버를 자동 실행하므로 별도의 `npm run dev`는 필요 없습니다.
`web/app`은 컨테이너의 `/app/app`에 bind mount되어 저장한 변경이 즉시 전달됩니다.
Compose에서는 Webpack 개발 모드와 1초 간격의 Watchpack 폴링을 사용하여
Windows Docker Desktop에서도 변경을 감지하고 Fast Refresh로 브라우저를 갱신합니다.
`page.tsx`, `layout.tsx`, `globals.css` 및 `app` 아래 새 파일은 재빌드 없이 반영됩니다.
호스트의 `node_modules`와 `.next`는 마운트하지 않아 컨테이너 파일과 분리됩니다.
패키지, Dockerfile, `app` 밖의 설정 또는 스케줄러 변경은 `docker compose up --build`로 반영합니다.

기존 실행 환경에는 이번 Compose 설정을 한 번 적용해야 합니다:

```sh
docker compose up --build
```

그 후 http://127.0.0.1:3000/ 에서 `web/app/page.tsx`를 수정·저장하여 확인합니다.
이전 구성은 빌드 시 소스만 복사했으므로 개발 서버가 실행 중이어도 호스트의 변경을 볼 수 없었습니다.

Next.js의 개발용 Origin 검사에서 HMR WebSocket이 차단되지 않도록
`next.config.ts`에 `allowedDevOrigins: ['127.0.0.1']`을 지정합니다.
`localhost`는 Next.js가 기본 허용합니다. 이 설정이 없으면 `127.0.0.1`에서
페이지 요청은 성공해도 HMR 연결이 거부되어 수동 새로고침이 필요할 수 있습니다.
설정은 이미지에 복사되므로 변경 후 한 번 재빌드해야 합니다.
Fast Refresh 확인은 페이지를 열어둔 채 텍스트를 저장하고, 새로고침 없이 화면이
바뀌는지 확인해야 합니다. HTTP 재요청만으로는 자동 갱신을 검증할 수 없습니다.

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
Compose 내부 주소는 `mariadb:3306`입니다. 같은 PC의 HeidiSQL에서는
호스트에 연결한 `127.0.0.1:3306`을 사용합니다.

기본 root 암호 `local-development-only`는 이 로컬 개발 환경 전용입니다.
필요하면 최초 실행 전에 `.env`에 `MARIADB_ROOT_PASSWORD=원하는암호`를 지정할 수 있습니다.
이미 초기화된 볼륨의 암호는 환경변수 변경만으로 바뀌지 않습니다.

## HeidiSQL에서 MariaDB 접속

`mariadb`는 Compose 네트워크 안에서 사용하는 서비스 이름입니다.
Docker Desktop을 실행하는 Windows PC의 HeidiSQL에서는 `127.0.0.1`로 접속합니다.
`compose.yaml`의 MariaDB 포트 설정은 다음과 같습니다:

```yaml
ports:
  - "127.0.0.1:3306:3306"
```

앞의 `3306`은 PC의 포트, 뒤의 `3306`은 컨테이너의 MariaDB 포트입니다.
`127.0.0.1`에 바인딩하므로 같은 PC에서 접속하도록 설정됩니다.

프로젝트 루트에서 아래 명령으로 포트 설정을 적용합니다.
기존 컨테이너가 있다면 재생성되며, DB 데이터는 기존 named volume에 유지됩니다.

```sh
docker compose up -d mariadb
docker compose ps mariadb
docker compose port mariadb 3306
```

MariaDB가 `(healthy)` 상태이고 포트 조회 결과가 `127.0.0.1:3306`이면,
HeidiSQL을 실행하고 **신규(New)** 세션에 다음 값을 입력한 뒤 **열기(Open)**를 누릅니다.

| 항목 | 값 |
| --- | --- |
| 네트워크 유형 | MariaDB or MySQL (TCP/IP) |
| 호스트명 / IP | `127.0.0.1` |
| 사용자 | `root` |
| 암호 | 기본값 `local-development-only` 또는 DB 최초 초기화 시 지정한 암호 |
| 포트 | `3306` |
| 데이터베이스 | 비워 둠 (접속 후 선택) |

아직 애플리케이션 DB와 테이블을 생성하지 않았으므로 시스템 DB만 보이는 것은 정상입니다.

- PC의 `3306` 포트를 다른 MySQL/MariaDB가 사용 중이면 포트 설정을
  `"127.0.0.1:3307:3306"`으로 바꾸고 `docker compose up -d mariadb`를 다시 실행합니다.
  이때 HeidiSQL 포트도 `3307`로 바꿉니다. Compose 내부 주소는 계속 `mariadb:3306`입니다.
- 연결이 거부되면 Docker Desktop 실행 여부와 `docker compose ps mariadb`,
  `docker compose logs --tail=30 mariadb`로 기동 상태 및 포트 설정을 확인합니다.
- `Access denied`가 나오면 DB 최초 초기화 시 사용한 암호를 확인합니다.
  `.env` 변경만으로 기존 DB 암호가 바뀌지는 않습니다. 암호 문제 해결을 위해
  볼륨을 삭제하면 데이터도 지워지므로 기존 볼륨을 유지합니다.

참고: [Docker 포트 공개](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/),
[HeidiSQL 연결 도움말](https://www.heidisql.com/help.php).

## 의존성 및 범위

런타임 직접 의존성은 scheduler의 `node-cron`, web의 `next`, `react`, `react-dom`입니다.
TypeScript와 타입 선언 패키지, Tailwind CSS 및 PostCSS 관련 패키지는 개발 의존성입니다.
각 package-lock.json과 `npm ci`로 의존성을 고정합니다.
API, ORM, 업무 기능, 테스트 코드, 배포 및 CI/CD 구성은 포함하지 않습니다.

## TypeScript 및 Tailwind CSS

애플리케이션 소스는 `.ts`와 `.tsx`를 사용합니다. 스케줄러는 Node.js 24의
내장 TypeScript 지원으로 `index.ts`를 직접 실행합니다. 실행 시 타입 검사는
하지 않으며, enum 등 JavaScript 코드 생성이 필요한 문법은 사용하지 않습니다.
Next.js는 TypeScript를 자체 처리합니다.

Tailwind CSS는 `postcss.config.json`의 `@tailwindcss/postcss` 플러그인과
`app/globals.css`의 import로 연결됩니다. 루트 body에 `min-h-screen`을 적용했고
별도의 Tailwind CLI 실행은 필요 없습니다.

타입 검사는 각 앱에서 `npm run typecheck`로 수행할 수 있습니다.
호스트에서 검사하려면 해당 앱의 `npm ci`가 필요하지만, Compose 실행에는 필요 없습니다.

전환 후 두 앱의 타입 검사, 스케줄러 TS 실행 및 작업 등록, Next.js HTTP 200,
Tailwind CSS 생성 및 HTTP 200 응답을 확인했습니다.
사용자가 주석 처리한 `console.log('수신중')`은 보존했습니다.
현재 로그 출력을 다시 켜려면 `scheduler/index.ts`에서 해당 주석을 해제합니다.

## 이번 작업의 검증 결과

- 로컬 Node.js 24에서 스케줄러 출력 5회 확인 (간격 987~1009ms).
- Next.js 개발 서버 시작 및 `/` HTTP 200 응답 확인.
- 직접 의존성 목록 확인, npm audit에서 취약점 0개 확인.
- Docker CLI 및 Docker Desktop 기본 설치 경로가 없어 Compose 빌드·기동과
  MariaDB healthy 상태는 아직 검증하지 못했습니다. Docker Desktop 실행 후 위 명령으로 확인해야 합니다.
