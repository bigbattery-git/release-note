# Next.js, React, Node.js, MariaDB 업데이트 수집 API 조사

- 조사일: 2026-09-09
- 조사 범위: 새 버전과 릴리스 노트를 주기적으로 수집해 화면에 표시하기 위한 공개 API
- 기준: 각 프로젝트의 공식 사이트·공식 저장소와 GitHub 공식 REST API 문서

## 1. 결론

네 기술 모두 새 버전을 자동으로 감지할 수 있다. 다만 각 제품이 동일한 형태의
"공지사항 API"를 제공하는 것은 아니다.

| 대상 | 권장 수집원 | 제공 주체 | 새 버전 감지 | 상세 변경 내용 | 일반 공지 |
| --- | --- | --- | --- | --- | --- |
| Next.js | GitHub Releases REST API | 공식 `vercel/next.js` 저장소 + GitHub API | 가능 | `body`에 릴리스 노트 제공 | 별도 구조화 API는 확인되지 않음 |
| React | GitHub Releases REST API | 공식 `react/react` 저장소 + GitHub API | 가능 | `body`에 릴리스 노트 제공 | 별도 구조화 API는 확인되지 않음 |
| Node.js | GitHub Releases REST API | 공식 `nodejs/node` 저장소 + GitHub API | 가능 | `body`에 릴리스 노트 제공 | 공식 블로그가 있으나 문서화된 공지 API는 확인되지 않음 |
| Node.js 보조 | 공식 배포 JSON 인덱스 | Node.js | 가능 | 버전·날짜·LTS·보안 여부만 제공 | 제공하지 않음 |
| MariaDB | Downloads REST API | MariaDB Foundation | 가능 | 릴리스 노트·변경 로그 URL 필드 제공(빈 값 가능) | 별도 구조화 API는 확인되지 않음 |

따라서 1차 구현은 다음과 같이 구성하는 것이 적절하다.

1. Next.js, React, Node.js는 같은 GitHub Releases 응답 타입을 재사용한다.
2. Next.js의 `prerelease: true`인 canary 릴리스는 서비스 정책에 따라 제외한다.
3. React와 Node.js도 안정 버전만 보여줄 때는 `draft === false && prerelease === false`를 적용한다.
4. Node.js는 GitHub 응답의 `body`를 화면용 상세 내역으로 사용하고, 필요하면 공식 JSON 인덱스의
   `lts`와 `security`를 보조 정보로 결합한다.
5. MariaDB는 먼저 릴리스 계열 목록을 받은 뒤, 감시할 각 계열의 point release 목록을 조회한다.
6. 마지막으로 저장한 고유 ID 또는 버전과 비교해 신규 항목만 저장·표시한다.

MariaDB는 버전과 날짜 감지에는 적합하지만, 실제 최신 응답에서도 `release_notes_url`과
`change_log`가 빈 문자열인 사례가 확인됐다. 상세 내역 링크가 반드시 존재한다고 가정하면 안 된다.

이 조사에서 "API가 없다"는 표현은 공개 웹페이지가 없다는 뜻이 아니라, 공식 문서에서
자동 수집용으로 명시한 구조화 API를 찾지 못했다는 뜻이다. 블로그 HTML 스크래핑은 마크업 변경에
취약하므로 최초 구현의 데이터 소스로 권장하지 않는다.

## 2. `.env` 권장값

아래 값은 그대로 `.env`에 복사할 수 있다. URL에는 Markdown용 이스케이프를 넣지 않는다.
`GITHUB_TOKEN`은 공개 저장소 조회 시 선택 사항이지만, 정기 수집 서비스에서는 rate limit 때문에
서버 전용 환경변수로 설정하는 편이 좋다. 브라우저에 노출되는 `NEXT_PUBLIC_` 접두사를 사용하면 안 된다.

```dotenv
# GitHub Releases API: Next.js, React, Node.js 공통
GITHUB_API_BASE_URL=https://api.github.com
GITHUB_API_VERSION=2026-03-10
GITHUB_TOKEN=
GITHUB_USER_AGENT=news-summery/1.0

NEXTJS_RELEASES_PATH=/repos/vercel/next.js/releases
REACT_RELEASES_PATH=/repos/react/react/releases
NODEJS_RELEASES_PATH=/repos/nodejs/node/releases

# Node.js 공식 배포 인덱스: 선택적 보조 수집원
NODEJS_DIST_BASE_URL=https://nodejs.org
NODEJS_RELEASE_INDEX_PATH=/download/release/index.json

# MariaDB Foundation Downloads REST API
MARIADB_DOWNLOADS_API_BASE_URL=https://downloads.mariadb.org
MARIADB_MAJOR_RELEASES_PATH=/rest-api/mariadb/
MARIADB_POINT_RELEASES_PATH_TEMPLATE=/rest-api/mariadb/{releaseSeries}/
```

URL 조합 시 base URL의 끝 `/`와 path의 시작 `/`가 중복되지 않게 한다. 위 설정은
`${BASE_URL}${PATH}`로 바로 합칠 수 있게 맞춰 두었다.

## 3. GitHub Releases REST API 공통 명세

Next.js, React, Node.js에 공통으로 적용한다. GitHub의 **List releases**는 일반 Git tag가 아니라
GitHub Release로 발행된 항목만 반환한다. 공개 저장소의 published release는 인증 없이 조회할 수 있다.

### 3.1 주소와 메서드

| 항목 | 값 |
| --- | --- |
| 메인 주소 | `https://api.github.com` |
| 공통 패스 | `/repos/{owner}/{repo}/releases` |
| HTTP 메서드 | `GET` |
| 요청 본문 | 없음 |
| 응답 Content-Type | `application/json` |

제품별 확정 경로는 다음과 같다.

| 대상 | `owner` | `repo` | 패스 |
| --- | --- | --- | --- |
| Next.js | `vercel` | `next.js` | `/repos/vercel/next.js/releases` |
| React | `react` | `react` | `/repos/react/react/releases` |
| Node.js | `nodejs` | `node` | `/repos/nodejs/node/releases` |

React의 과거 주소인 `facebook/react`는 현재 요청 시 `react/react`로 이동될 수 있으므로 새 구현에는
현재 공식 주소인 `react/react`를 사용한다.

### 3.2 Header

| 변수명 | HTTP Header | 값 타입 | 필수 | 값 예시 | 설명 |
| --- | --- | --- | --- | --- | --- |
| `accept` | `Accept` | `string` | 권장 | `application/vnd.github+json` | GitHub가 권장하는 JSON 미디어 타입 |
| `apiVersion` | `X-GitHub-Api-Version` | `string` | 권장 | `2026-03-10` | 응답 계약을 지정하는 GitHub REST API 버전 |
| `authorization` | `Authorization` | `string` | 선택 | `Bearer ${GITHUB_TOKEN}` | 공개 조회는 생략 가능. 정기 수집 시 rate limit 확보용 |
| `userAgent` | `User-Agent` | `string` | 권장 | `news-summery/1.0` | 호출 애플리케이션 식별자 |
| `ifNoneMatch` | `If-None-Match` | `string` | 선택 | 이전 응답의 `ETag` 값 | 변경이 없으면 `304 Not Modified`를 받기 위한 조건부 요청 |

토큰 값이 비어 있으면 `Authorization` 헤더 자체를 보내지 않는다. 문자열 `Bearer `만 전송해서는 안 된다.

### 3.3 Path와 Query

| 위치 | 변수명 | 값 타입 | 필수 | 기본값·범위 | 설명 |
| --- | --- | --- | --- | --- | --- |
| Path | `owner` | `string` | 필수 | 제품별 표 참고 | 공식 저장소 소유자 |
| Path | `repo` | `string` | 필수 | 제품별 표 참고 | `.git`을 제외한 저장소 이름 |
| Query | `perPage` → `per_page` | `number` 정수 | 선택 | 기본 `30`, 최대 `100` | 한 페이지에 받을 릴리스 수 |
| Query | `page` | `number` 정수 | 선택 | 기본 `1` | 조회할 페이지 번호 |

목록 응답은 배열이다. 다음 페이지가 있으면 응답의 `Link` 헤더에 `rel="next"` 링크가 제공된다.
최신 항목만 주기적으로 확인한다면 같은 `per_page`와 `page=1`을 유지해 조건부 요청의 캐시 적중률을 높인다.

### 3.4 상태 코드와 응답 헤더

| 상태·헤더 | 의미 | 처리 권장사항 |
| --- | --- | --- |
| `200 OK` | 릴리스 배열 반환 | 응답을 파싱하고 고유 `id`로 중복 제거 |
| `304 Not Modified` | `If-None-Match` 기준 변경 없음 | 본문 파싱 없이 종료 |
| `404 Not Found` | 저장소가 없거나 접근 불가 | 경로와 권한을 확인하고 반복 재시도 중단 |
| `403` 또는 `429` | rate limit 또는 abuse 제한 가능 | `Retry-After`, `X-RateLimit-Reset`에 맞춰 재시도 |
| `ETag` | 현재 표현의 식별자 | 다음 요청의 `If-None-Match`로 저장 |
| `Link` | 페이지 탐색 URL | 전체 이력 동기화 시 직접 URL을 재조립하지 말고 이 값 사용 |
| `X-RateLimit-Remaining` | 남은 요청 수 | 스케줄러의 호출 간격 결정에 활용 |
| `X-RateLimit-Reset` | 제한 초기화 UTC epoch seconds | 제한 초과 시 다음 호출 시점 계산 |

공개 데이터의 인증 없는 요청 한도는 일반적으로 IP 기준 시간당 60회이고, 개인 access token을 사용한
일반 인증 요청은 보통 시간당 5,000회다. 인증된 조건부 요청이 `304`를 반환하면 primary rate limit에
포함되지 않으므로 폴링 서비스에는 `ETag` 사용이 특히 유리하다.

### 3.5 응답 필드

API의 실제 응답에는 화면에 필요하지 않은 URL과 사용자 세부 필드도 포함된다. 아래는 신규 릴리스
판별과 표시, 다운로드 링크 제공에 유용한 필드다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `number` | GitHub Release 고유 ID. 중복 방지 키로 권장 |
| `tag_name` | `string` | 버전 tag. 예: `v16.3.4` |
| `target_commitish` | `string` | 릴리스 대상 branch 또는 commit |
| `name` | `string \| null` | 릴리스 제목 |
| `body` | `string \| null` | Markdown 형식 릴리스 노트 |
| `draft` | `boolean` | 초안 여부. 공개 무인증 조회에는 일반적으로 초안이 포함되지 않음 |
| `prerelease` | `boolean` | canary, RC 등의 사전 릴리스 여부 |
| `immutable` | `boolean` | GitHub의 immutable release 여부 |
| `created_at` | ISO 8601 `string` | 릴리스 객체 생성 시각 |
| `updated_at` | ISO 8601 `string` | 릴리스 객체 수정 시각 |
| `published_at` | ISO 8601 `string \| null` | 실제 발행 시각. 정렬·표시 기준으로 권장 |
| `html_url` | `string` | 사용자가 열 수 있는 GitHub 릴리스 페이지 |
| `author` | object | 릴리스 작성자 정보 |
| `assets` | array | 첨부 파일 목록 |
| `tarball_url` | `string \| null` | 소스 tarball API URL |
| `zipball_url` | `string \| null` | 소스 zipball API URL |

### 3.6 TypeScript 요청·응답 인터페이스

모든 interface 이름은 `I`로 시작한다. `IGitHubReleaseResponse`는 배열을 감싸는 실제 객체가 아니라,
서비스 계층에서 응답을 전달하기 위한 명시적 형태다. GitHub API 본문 자체는 `IGitHubRelease[]`이다.

```ts
interface IGitHubReleasePathParameters {
  owner: string;
  repo: string;
}

interface IGitHubReleaseQuery {
  perPage?: number;
  page?: number;
}

interface IGitHubReleaseHeaders {
  accept: 'application/vnd.github+json';
  apiVersion: string;
  authorization?: `Bearer ${string}`;
  userAgent?: string;
  ifNoneMatch?: string;
}

interface IGitHubUser {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  html_url: string;
  type: string;
  site_admin: boolean;
}

interface IGitHubReleaseAsset {
  id: number;
  node_id: string;
  name: string;
  label: string | null;
  state: 'uploaded' | string;
  content_type: string;
  size: number;
  download_count: number;
  browser_download_url: string;
  created_at: string;
  updated_at: string;
  uploader: IGitHubUser | null;
  digest?: string | null;
}

interface IGitHubRelease {
  id: number;
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  immutable: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  url: string;
  html_url: string;
  assets_url: string;
  upload_url: string;
  tarball_url: string | null;
  zipball_url: string | null;
  author: IGitHubUser | null;
  assets: IGitHubReleaseAsset[];
}

interface IGitHubReleaseResponse {
  status: 200;
  etag?: string;
  link?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  data: IGitHubRelease[];
}

interface IGitHubNotModifiedResponse {
  status: 304;
  data: null;
}
```

### 3.7 대상별 해석 주의사항

#### Next.js

- 공식 저장소는 stable과 canary 두 release channel을 모두 발행한다.
- 안정 버전 알림만 제공하려면 `draft === false && prerelease === false`로 거른다.
- `tag_name`에 `-canary.`가 들어가는지도 방어적으로 확인할 수 있지만, 공식 의미 필드는
  `prerelease`이므로 이를 1차 기준으로 사용한다.
- `body`에는 변경 항목과 관련 pull request 링크가 포함될 수 있다.

#### React

- `tag_name`, `published_at`, `body`, `html_url`을 이용해 버전·날짜·변경 요약·원문 링크를 표시할 수 있다.
- stable만 필요하면 Next.js와 같은 `draft`/`prerelease` 필터를 사용한다.
- React 블로그의 기능 소개 글은 GitHub Release와 발행 시점이나 상세 수준이 다를 수 있으며,
  Releases API가 모든 일반 블로그 공지를 대신하지는 않는다.

#### Node.js

- GitHub Release의 `body`에는 notable changes와 commit 목록 등이 포함되어 상세 화면에 적합하다.
- LTS 여부는 release `name`이나 `body` 문자열을 파싱하기보다 아래 공식 배포 인덱스의 `lts` 필드와
  `tag_name`을 연결하는 것이 안전하다.
- `tag_name`을 Node.js 배포 인덱스의 `version`과 조인 키로 사용할 수 있다.

## 4. Node.js 공식 배포 JSON 인덱스

Node.js가 운영하는 공개 JSON 파일이다. 새 배포 감지, LTS 코드명, 보안 릴리스 여부 확인에는 유용하지만
상세 변경 설명은 없으므로 GitHub Releases API의 보조 수집원으로 권장한다. 공식 사이트에서 접근 가능한
실제 JSON이지만, GitHub REST API처럼 별도의 버전이 지정된 정식 API 계약 문서는 확인되지 않았다.
따라서 필드 누락에 견디는 파서를 사용해야 한다.

### 4.1 요청 명세

| 항목 | 값 |
| --- | --- |
| 메인 주소 | `https://nodejs.org` |
| 패스 | `/download/release/index.json` |
| HTTP 메서드 | `GET` |
| Header | 필수 항목 없음. `Accept: application/json` 권장 |
| Query | 없음 |
| 요청 본문 | 없음 |
| 성공 응답 | JSON 배열 |

### 4.2 응답 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `version` | `string` | `v` 접두사가 있는 Node.js 버전 |
| `date` | `string` | `YYYY-MM-DD` 릴리스 날짜 |
| `files` | `string[]` | 제공되는 플랫폼·패키지 식별자 |
| `npm` | `string` | 포함된 npm 버전 |
| `v8` | `string` | 포함된 V8 버전 |
| `uv` | `string` | 포함된 libuv 버전 |
| `zlib` | `string` | 포함된 zlib 버전 |
| `openssl` | `string` | 포함된 OpenSSL 버전 |
| `modules` | `string` | Node module ABI 버전 |
| `lts` | `string \| false` | LTS이면 코드명, 아니면 `false` |
| `security` | `boolean` | 보안 릴리스 표시 |

```ts
interface INodeReleaseIndexItem {
  version: string;
  date: string;
  files: string[];
  npm?: string;
  v8?: string;
  uv?: string;
  zlib?: string;
  openssl?: string;
  modules?: string;
  lts: string | false;
  security: boolean;
}

interface INodeReleaseIndexRequest {
  headers?: {
    accept?: 'application/json';
  };
}

interface INodeReleaseIndexResponse {
  status: 200;
  data: INodeReleaseIndexItem[];
}
```

Node.js 인덱스의 최신 항목이 배열 앞쪽에 오는 현재 동작만 믿고 첫 원소만 영구적으로 선택하기보다는,
`date`와 semantic version을 명시적으로 비교하는 편이 안전하다. 서비스가 LTS만 다루면
`lts !== false`, 보안 업데이트를 강조하려면 `security === true`를 사용한다.

## 5. MariaDB Foundation Downloads REST API

MariaDB Foundation은 다운로드 자동화를 위한 REST API를 공식 문서화했다. MariaDB Server의
product ID는 `mariadb`다. 인증은 요구하지 않는다.

### 5.1 API A: 릴리스 계열 목록

| 항목 | 값 |
| --- | --- |
| 설명 | MariaDB Server의 major/minor release series와 상태, 지원 유형, EOL 조회 |
| 메인 주소 | `https://downloads.mariadb.org` |
| 패스 | `/rest-api/mariadb/` |
| HTTP 메서드 | `GET` |
| Header | 필수 항목 없음. `Accept: application/json` 권장 |
| Query | 없음 |
| 요청 본문 | 없음 |
| 성공 응답 | `application/json` 객체 |

| 응답 필드 | 타입 | 설명 |
| --- | --- | --- |
| `major_releases` | array | 릴리스 계열 목록 |
| `release_id` | `string` | 계열 ID. 예: `11.8` |
| `release_name` | `string` | 표시용 계열 이름 |
| `release_status` | `string` | 예: `Stable`, `RC`, `Preview` |
| `release_support_type` | `string \| null` | 예: `Long Term Support`, `Rolling` |
| `release_eol_date` | `string \| null` | EOL 날짜 `YYYY-MM-DD` |

```ts
interface IMariaDbMajorRelease {
  release_id: string;
  release_name: string;
  release_status: string;
  release_support_type: string | null;
  release_eol_date: string | null;
}

interface IMariaDbMajorReleasesRequest {
  headers?: {
    accept?: 'application/json';
  };
}

interface IMariaDbMajorReleasesResponse {
  major_releases: IMariaDbMajorRelease[];
}
```

### 5.2 API B: 특정 계열의 point release와 파일 목록

| 항목 | 값 |
| --- | --- |
| 설명 | 한 release series에 속한 실제 배포 버전, 날짜, 릴리스 노트와 파일 조회 |
| 메인 주소 | `https://downloads.mariadb.org` |
| 패스 템플릿 | `/rest-api/mariadb/{releaseSeries}/` |
| 요청 예시 | `/rest-api/mariadb/11.8/` |
| HTTP 메서드 | `GET` |
| Header | 필수 항목 없음. `Accept: application/json` 권장 |
| 요청 본문 | 없음 |
| 성공 응답 | `application/json` 객체 |

| 위치 | 변수명 | 값 타입 | 필수 | 설명 |
| --- | --- | --- | --- | --- |
| Path | `releaseSeries` | `string` | 필수 | API A의 `release_id`. 예: `11.8` |
| Query | `mirror` | `string` | 선택 | 특정 다운로드 mirror ID 선택 |

업데이트 감지만 필요하면 `mirror`는 보내지 않는다. 응답의 `releases`는 배열이 아니라
point release ID를 key로 사용하는 객체다.

| 응답 필드 | 타입 | 설명 |
| --- | --- | --- |
| `releases` | `Record<string, IMariaDbPointRelease>` | 버전 문자열을 key로 한 릴리스 map |
| `release_id` | `string` | point release ID. 예: `11.8.3` |
| `release_name` | `string` | 표시용 릴리스 이름 |
| `date_of_release` | `string` | `YYYY-MM-DD` 릴리스 날짜 |
| `release_notes_url` | `string` | 공식 릴리스 노트 URL. 빈 문자열일 수 있음 |
| `change_log` | `string` | 공식 변경 로그 URL. 빈 문자열일 수 있음 |
| `files` | array | 배포 파일과 checksum, 서명 정보 |

```ts
interface IMariaDbPointReleasesPathParameters {
  releaseSeries: string;
}

interface IMariaDbPointReleasesQuery {
  mirror?: string;
}

interface IMariaDbPointReleasesRequest {
  path: IMariaDbPointReleasesPathParameters;
  query?: IMariaDbPointReleasesQuery;
  headers?: {
    accept?: 'application/json';
  };
}

interface IMariaDbChecksum {
  md5sum: string | null;
  sha1sum: string | null;
  sha256sum: string | null;
  sha512sum: string | null;
}

interface IMariaDbReleaseFile {
  file_id: number | string;
  file_name: string;
  package_type: string | null;
  os: string | null;
  cpu: string | null;
  checksum: IMariaDbChecksum;
  signature: string | null;
  checksum_url: string;
  signature_url: string;
  file_download_url: string;
}

interface IMariaDbPointRelease {
  release_id: string;
  release_name: string;
  date_of_release: string;
  release_notes_url: string;
  change_log: string;
  files: IMariaDbReleaseFile[];
}

interface IMariaDbPointReleasesResponse {
  releases: Record<string, IMariaDbPointRelease>;
}
```

공식 문서의 예시는 `file_id`를 문자열로 표시하지만 2026-09-09 실제 응답에서는 숫자였다. 또한 일부
파일에서 `package_type`, `os`, CPU, signature, checksum 값이 `null`이었다. 문서와 실제 응답 양쪽을
수용하도록 위 타입을 구성했다. `release_notes_url`과 `change_log`도 빈 문자열일 수 있으므로 링크를
표시하기 전에 값의 존재를 확인해야 한다.
MariaDB 문서는 이 조회 API의 오류 상태 코드와 오류 본문 schema를 별도로 명시하지 않으므로,
`response.ok` 확인 후 실패 본문을 성공 타입으로 단언하지 않아야 한다.

### 5.3 MariaDB 수집 순서

MariaDB에는 모든 지원 계열의 최신 point release를 한 번에 반환하는 것으로 문서화된 endpoint가 없다.
다음 순서로 수집한다.

1. `/rest-api/mariadb/`에서 release series를 받는다.
2. `release_status === 'Stable'` 등 서비스에 필요한 계열을 고른다.
3. 각 `release_id`에 대해 `/rest-api/mariadb/{releaseSeries}/`를 조회한다.
4. `Object.values(response.releases)`를 날짜 또는 버전으로 정렬한다.
5. `release_id`를 중복 방지 키로 저장하고, 값이 있을 때만 `release_notes_url`과 `change_log`를 노출한다.

EOL 계열을 제외할지는 현재 날짜와 `release_eol_date`를 함께 확인해 정책으로 결정해야 한다.
`release_status`만으로 현재 지원 여부를 완전히 대체하지 않는다.

## 6. 공통 애플리케이션 DTO 제안

외부 API의 snake_case 응답을 UI 전역에 퍼뜨리지 않고, 수집 단계에서 아래 공통 형태로 변환하면
정렬·중복 제거·MariaDB 저장 구조를 단순화할 수 있다.

```ts
interface ITechnologyUpdate {
  externalId: string;
  technology: 'nextjs' | 'react' | 'nodejs' | 'mariadb';
  version: string;
  title: string;
  summaryMarkdown: string | null;
  releasedAt: string;
  sourceUrl: string;
  changelogUrl: string | null;
  isPrerelease: boolean;
  isSecurityRelease: boolean | null;
  supportChannel: string | null;
}
```

권장 매핑은 다음과 같다.

| 공통 필드 | GitHub Release | Node.js 배포 인덱스 | MariaDB |
| --- | --- | --- | --- |
| `externalId` | `String(id)` | `version` | `release_id` |
| `version` | `tag_name` | `version` | `release_id` |
| `title` | `name ?? tag_name` | `version` | `release_name` |
| `summaryMarkdown` | `body` | `null` | `null` |
| `releasedAt` | `published_at ?? created_at` | `date` | `date_of_release` |
| `sourceUrl` | `html_url` | 해당 버전 공식 release URL 구성 또는 GitHub 값 사용 | `release_notes_url`이 비어 있지 않을 때 사용 |
| `changelogUrl` | 필요 시 `html_url` | GitHub Release `html_url` | 비어 있지 않은 `change_log`, 아니면 `null` |
| `isPrerelease` | `prerelease` | semantic version 정책으로 계산 | release series 상태로 계산 |
| `isSecurityRelease` | Node.js가 아니면 `null` | `security` | API에 직접 필드가 없으므로 `null` |
| `supportChannel` | 제품 정책으로 계산 | `lts === false ? 'Current' : lts` | 상위 계열의 `release_support_type` |

`releasedAt`은 외부 값이 날짜만 제공하는 경우도 있으므로 DB와 API 모델에서 무조건 완전한 UTC timestamp라고
가정하지 않는다. 원본 문자열을 보존하거나 날짜 정규화 규칙을 별도로 정한다.

## 7. 폴링과 데이터 품질 권장사항

- GitHub 세 저장소는 한 스케줄 주기 안에서도 과도하게 병렬 호출하지 않고 순차 호출한다.
- GitHub 응답의 `ETag`를 endpoint별로 저장하고 다음 요청에 `If-None-Match`로 보낸다.
- 최초 전체 동기화만 `Link` 헤더를 따라 페이지를 이동하고, 이후에는 첫 페이지를 고정된 조건으로 확인한다.
- 버전 문자열의 단순 사전식 정렬은 사용하지 않는다. 예를 들어 `v10`과 `v9`는 semantic version 비교가 필요하다.
- 릴리스 `body`는 Markdown이므로 HTML로 렌더링할 때 raw HTML을 신뢰하지 말고 sanitize한다.
- 외부 응답은 런타임 검증 후 저장한다. 이 문서의 TypeScript interface는 런타임 검증을 대신하지 않는다.
- 수정된 릴리스 노트도 반영하려면 `id`가 같더라도 `updated_at` 변경을 확인한다.
- API 오류를 "업데이트 없음"으로 저장하지 않는다. 성공, 변경 없음(`304`), 실패 상태를 구분한다.

## 8. 2026-09-09 직접 확인 결과

| endpoint | 확인 결과 |
| --- | --- |
| `GET /repos/vercel/next.js/releases?per_page=2&page=1` | `200`, JSON release 배열과 canary의 `prerelease: true`, Markdown `body` 확인 |
| `GET /repos/react/react/releases?per_page=2&page=1` | API 버전 `2026-03-10`으로 `200`, JSON release 배열과 stable release의 `body` 확인 |
| `GET /repos/nodejs/node/releases` | API 버전 `2026-03-10`으로 `200`, 버전별 상세 release 확인 |
| `GET /download/release/index.json` | `200`, 최신 항목에 `version`, `date`, `lts`, `security` 등 확인 |
| `GET /rest-api/mariadb/` | `200`, `major_releases`와 status/support/EOL 필드 확인 |
| `GET /rest-api/mariadb/11.8/` | `200`, point release map 확인. `file_id` 숫자, 일부 nullable 필드와 빈 릴리스 노트 URL 확인 |

이 결과는 조사일 당시의 접근성과 예시 응답을 확인한 것이며, 영구적인 가용성 보장은 아니다.

## 9. 공식 참고 자료

- [GitHub REST API - List releases](https://docs.github.com/en/rest/releases/releases)
- [GitHub REST API 버전](https://docs.github.com/en/rest/about-the-rest-api/api-versions)
- [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [GitHub REST API 조건부 요청과 폴링 권장사항](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- [GitHub REST API pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)
- [Next.js 공식 Releases](https://github.com/vercel/next.js/releases)
- [Next.js 공식 release channels 문서](https://github.com/vercel/next.js/blob/canary/contributing/repository/release-channels-publishing.md)
- [React 공식 저장소](https://github.com/react/react)
- [React 공식 Releases](https://github.com/react/react/releases)
- [Node.js 공식 Releases](https://github.com/nodejs/node/releases)
- [Node.js 공식 배포 JSON 인덱스](https://nodejs.org/download/release/index.json)
- [Node.js 공식 release 정책](https://nodejs.org/en/about/previous-releases)
- [MariaDB Foundation Downloads REST API](https://mariadb.org/downloads-rest-api/)
- [MariaDB Server 다운로드 페이지의 REST API 안내](https://mariadb.org/download/)
