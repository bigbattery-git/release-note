# Helldivers 2 API 이해와 연동 가이드

Swagger 명세 분석과 실제 호출 검증을 바탕으로 정리한 한국어 기술 문서입니다. 새 프로젝트의 기능 범위와 데이터 연동 방식을 결정할 때 사용할 수 있습니다.

작성 기준: 2026년 9월 6일 · Markdown 기준 문서 · 대상: api.helldivers2.dev

### 이 API가 제공하는 것

게임의 은하 전쟁 현황을 JSON으로 조회하는 커뮤니티 API입니다. 행성의 상태, 진행 중인 캠페인, 주요 명령(Major Orders), 사령부 지령, Steam 뉴스와 민주주의 우주 정거장 정보를 제공합니다. Arrowhead가 공식 보증하는 API는 아닙니다. [1, 2]

| 영역 | 역할 |
| --- | --- |
| /api/v1 | 화면에서 사용하기 좋게 가공한 전쟁·행성·명령·뉴스 데이터 |
| /api/v2 | 지령과 우주 정거장 데이터. 모든 v1 기능의 대체 버전은 아님 |
| /raw | 게임 원본에 가까운 구조. 숫자 코드와 별도 데이터 연결이 필요할 수 있음 |

### 확인한 범위

Swagger가 참조하는 OpenAPI 3.0.0 JSON의 경로, 파라미터, 응답 스키마와 보안 정의를 확인했습니다. 명세에는 루트 경로를 포함해 총 24개의 GET 작업이 있습니다. 쓰기 작업은 문서화되어 있지 않습니다. [1]

실제 성공 호출은 GET /api/v1/war 한 건입니다. 나머지 엔드포인트의 설명은 명세 분석 결과이며, 실제 응답을 모두 검증한 것은 아닙니다. 명세의 info.version 값 1.0.0.0과 URL의 v1/v2는 서로 다른 정보입니다. [1, 3]

### 문서 구성

호출 방법 · 데이터 관계 · 해석과 운영 주의점 · 가공 API 목록 · raw API 및 출처 · README 보충 설명

## 01. 호출 방법과 실제 검증

기본 주소는 https://api.helldivers2.dev 입니다. 여기에 /api/v1/war 같은 전체 경로를 붙입니다. 일반 조회용 API 키를 별도로 발급받는 흐름은 안내되어 있지 않습니다. [1, 2]

| 헤더 | 이번에 검증한 값 / 의미 |
| --- | --- |
| X-Super-Client | api.helldivers2.dev / 호출 애플리케이션을 식별하는 값 |
| X-Super-Contact | 빈 문자열 / 헤더 자체는 전송. 개발자 연락처나 URL을 담도록 정의됨 |

### 검증 결과

X-Super-Client만 보냈을 때 서버는 두 헤더가 필요하다는 오류를 반환했습니다. X-Super-Contact를 실제 빈 값으로 추가하자 HTTP 200 OK와 JSON 응답을 받았습니다. 빈 문자열 허용은 이번 호출에서 확인한 동작이며, 모든 환경에서의 영구 보장을 뜻하지는 않습니다. [3]

```bat
curl.exe --header "X-Super-Client: api.helldivers2.dev" ^
  --header "X-Super-Contact;" ^
  "https://api.helldivers2.dev/api/v1/war"
```

위 명령은 Windows cmd용입니다. curl의 세미콜론 표기는 빈 헤더 값을 전송합니다. X-Super-Contact: ""라는 두 개의 따옴표 문자를 값으로 보내는 것과 다릅니다.

### JavaScript 요청 예시

```javascript
const response = await fetch(
  'https://api.helldivers2.dev/api/v1/war',
  { headers: {
      'X-Super-Client': 'api.helldivers2.dev',
      'X-Super-Contact': ''
  } }
);
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}
const war = await response.json();
```

JavaScript 예시는 설명용이며 이 문서 작성 중 실행하지 않았습니다. 브라우저에서 직접 호출할 경우 사용자 정의 헤더에 따른 CORS 사전 요청 허용 여부를 따로 확인해야 합니다. curl의 성공만으로 브라우저 호출까지 검증되지는 않습니다.

OpenAPI는 두 헤더를 동일한 security 요구사항 객체에 선언합니다. Bearer 방식도 정의되어 있으나, 문서화된 작업에 일반 조회의 필수 조건으로 연결되어 있지 않습니다. README의 Contact 선택 사항 안내보다 이번 서버 응답이 더 엄격했습니다. [1-3]

## 02. 핵심 데이터와 연결 관계

| 모델 | 주요 필드와 해석 |
| --- | --- |
| War | started / ended / now, factions, impactMultiplier, statistics. 전쟁 전체 정보이며 행성 목록을 포함하는 모델은 아님 |
| Planet | index, name, sector, position, waypoints, currentOwner, health, maxHealth, regenPerSecond, event, statistics, regions |
| Campaign | id, type, count, faction, planet. 전투 대상 행성의 Planet 객체를 포함 |
| Assignment | id, title, briefing, description, progress, tasks, reward / rewards, expiration, flags. 커뮤니티 주요 명령 |
| Dispatch | id, published, type, message. 사령부의 전황 메시지 |
| SteamNews | id, title, url, author, content, publishedAt. Steam 뉴스이며 지령과 다른 데이터 |
| SpaceStation | id32, planet, electionEnd, flags, tacticalActions. 전술 행동의 costs에 목표·현재 수치 등이 포함 |

### 행성을 중심으로 연결합니다

Planet.index가 행성의 식별자입니다. waypoints는 연결된 행성의 index 배열이고 attacking도 행성 index를 참조합니다. Campaign.planet과 SpaceStation.planet은 행성 객체를 포함하므로 행성 ID로 화면 간 연결을 구성할 수 있습니다. [1]

Planet.event에는 진행 중인 이벤트 정보가 들어가며 없으면 null일 수 있습니다. event.campaignId는 연관 캠페인을 가리킵니다. /planet-events는 독립 Event 배열이 아니라 활성 이벤트가 있는 Planet 배열을 반환하도록 정의되어 있습니다. [1]

### 화면 기능에 적용하면

전황 요약에는 War, 은하 지도에는 Planet.position과 waypoints, 전투 목록에는 Campaign, 주요 명령 패널에는 Assignment, 소식 목록에는 Dispatch와 SteamNews를 사용합니다. 이는 데이터 구조를 바탕으로 한 구현 제안이며 프로젝트 기능을 확정한 것은 아닙니다.

## 03. 데이터 해석과 운영 시 주의점

### 실제 전쟁 응답에서 확인한 것 [3]

| 항목 | 2026-09-06 호출 결과 |
| --- | --- |
| HTTP / 형식 | 200 OK / application/json; charset=utf-8 |
| 응답 언어 | content-language: en-US |
| 진영 | Humans, Terminids, Automaton, Illuminate |
| 영향력 배율 / 플레이어 수 | impactMultiplier: 0.016399642 / statistics.playerCount: 73728 |
| 요청 제한 헤더 | x-ratelimit-limit: 5 / x-ratelimit-remaining: 4 |
| 시간 값 불일치 | now: 1972-07-23T12:44:30Z. 현재 스냅샷 시간이라는 명세 설명과 맞지 않음 |

이 수치는 호출 당시 스냅샷입니다. now 값의 원인은 검증하지 않았습니다. 화면의 마지막 조회 시간은 별도의 수신 시각으로 관리하고, API의 now를 실제 현재 시각으로 표시하기 전 의미를 확인하는 것이 좋습니다.

### 날짜, 언어, 빈 값 [1]

가공 API의 날짜는 대체로 date-time 문자열입니다. raw에는 Unix 초 단위 날짜와 expiresIn 같은 남은 초 수가 섞여 있어 필드별 정의를 따라야 합니다. raw의 모든 숫자 시간을 Unix 시간으로 일괄 변환하면 안 됩니다.

일부 이름·지령·주요 명령 텍스트는 문자열 또는 언어별 객체입니다. 명세는 Accept-Language: ivl-IV 사용 시 모든 지원 언어를 반환한다고 설명합니다. 열거된 언어에 한국어는 없으므로 한국어 응답을 보장할 수 없습니다. Region의 이름·상태와 Planet.event 등은 null 가능성을 처리해야 합니다.

### 숫자 코드와 명세의 한계 [1]

주요 명령의 progress, tasks.values, valueTypes와 일부 flags/type은 의미가 미상으로 설명되어 있습니다. 임의로 진행률이나 보상 종류를 단정하지 않아야 합니다. raw 우주 정거장 응답이 Assignment 배열로 기재된 점, Steam 단건 경로가 배열 응답으로 선언된 점도 실제 응답 확인이 필요한 항목입니다.

### 요청 제한과 구현 제안 [2, 3]

README 안내는 10초당 5회입니다. 실제 응답에서도 제한 5를 확인했으나 시간 구간은 응답만으로 검증하지 않았습니다. 공통 캐시와 중복 요청 병합을 적용하고, 429에서는 Retry-After에 따라 재시도하는 구성이 적절합니다. int64/uint64 식별자는 JavaScript 안전 정수 범위를 넘을 가능성도 점검해야 합니다.

## 04. 가공 API 전체 목록

아래 16개 경로의 메서드는 모두 GET입니다. []는 배열 반환입니다. 모델명 뒤의 2는 명세 내부 이름 충돌을 구분하기 위한 이름으로, URL 버전과 동일한 의미가 아닙니다. [1]

| 경로 | 응답 스키마 | 용도 |
| --- | --- | --- |
| /api/v1/war | War | 전쟁 전체 현황 |
| /api/v1/assignments | Assignment2[] | 주요 명령 |
| /api/v1/assignments/{index} | Assignment2 | 주요 명령 단건 |
| /api/v1/campaigns | Campaign2[] | 진행 중인 캠페인 |
| /api/v1/campaigns/{index} | Campaign2 | 진행 중인 캠페인 단건 |
| /api/v1/dispatches | Dispatch[] | 사령부 지령 |
| /api/v1/dispatches/{index} | Dispatch | 사령부 지령 단건 |
| /api/v1/planets | Planet[] | 행성 정보 |
| /api/v1/planets/{index} | Planet | 행성 정보 단건 |
| /api/v1/planet-events | Planet[] | 활성 이벤트가 있는 행성 |
| /api/v1/steam | SteamNews[] | Steam 뉴스 |
| /api/v1/steam/{gid} | SteamNews[] | Steam 뉴스 단건 |
| /api/v2/dispatches | Dispatch2[] | 사령부 지령 |
| /api/v2/dispatches/{index} | Dispatch2 | 사령부 지령 단건 |
| /api/v2/space-stations | SpaceStation[] | 우주 정거장 |
| /api/v2/space-stations/{index} | SpaceStation | 우주 정거장 단건 |

### 파라미터와 반환 형태

중괄호는 필수 경로 파라미터입니다. assignments와 space-stations의 index는 int64, campaigns·dispatches·planets는 int32입니다. Steam의 gid는 문자열입니다. index는 배열의 순번이 아니라 해당 리소스를 식별하는 값으로 다룹니다. [1]

목록 API에 페이지 번호·검색·정렬용 쿼리 파라미터는 이 명세에 선언되어 있지 않습니다. Steam 단건 경로에는 404가 문서화되어 있습니다. 다른 오류가 목록에 없다고 해서 발생하지 않는 것은 아닙니다. [1]

## 05. Raw API와 근거 자료

raw 경로는 원본에 가까운 데이터를 조회할 때 사용합니다. 801은 이 명세에 고정된 경로 문자열이며, 임의의 {warId} 파라미터로 선언되어 있지 않습니다. [1]

| GET 경로 | 200 응답 |
| --- | --- |
| / | string |
| /raw/api/WarSeason/current/WarID | WarId |
| /raw/api/WarSeason/801/Status | WarStatus |
| /raw/api/WarSeason/801/WarInfo | WarInfo |
| /raw/api/Stats/war/801/summary | WarSummary |
| /raw/api/NewsFeed/801 | NewsFeedItem[] |
| /raw/api/v2/Assignment/War/801 | Assignment[] |
| /raw/api/v2/SpaceStation/War/801/{index} | Assignment[] |

raw Assignment와 SpaceStation 경로에는 503 응답도 정의되어 있습니다. 특히 SpaceStation의 Assignment[] 반환 선언은 용도와 맞지 않아 명세 오류 가능성을 열어 두어야 합니다. [1]

### 출처 및 검증 기록

[1] Swagger / OpenAPI 원본

[https://helldivers-2.github.io/api/openapi/Helldivers-2-API.json](https://helldivers-2.github.io/api/openapi/Helldivers-2-API.json)

Swagger UI

[https://helldivers-2.github.io/api/openapi/swagger-ui.html](https://helldivers-2.github.io/api/openapi/swagger-ui.html)

[2] 사용자 제공 문서 사이트의 README 원문

[https://helldivers-2.github.io/api/README.md](https://helldivers-2.github.io/api/README.md)

[3] 실제 호출 대상

[https://api.helldivers2.dev/api/v1/war](https://api.helldivers2.dev/api/v1/war)

[3] 검증 시각: 응답 Date 기준 2026-09-06 07:33:13 UTC (한국 16:33:13). X-Super-Client: api.helldivers2.dev 및 빈 X-Super-Contact를 curl.exe로 전송했습니다. 앞선 Client 단독 호출에서는 두 헤더가 필요하다는 오류 메시지를 확인했습니다.

문서에 제시한 데이터 활용과 캐시 전략은 분석에 따른 제안입니다. 미검증 엔드포인트, 브라우저 CORS, 코드별 정확한 의미는 구현 단계에서 별도로 확인해야 합니다. 이 문서 작성으로 기존 애플리케이션 코드를 변경하지 않았습니다.

## 06. README로 보충한 운영 맥락

사용자가 제공한 문서 사이트가 불러오는 README.md 원문을 확인했습니다. Swagger는 요청·응답의 구조를 설명하고, README는 서비스의 성격과 이용 방침을 설명합니다. 이번 보충에서는 API를 추가 호출하지 않았으며, 앞선 실측 기록을 유지했습니다. [2, 3]

### 인증과 호출자 식별은 다른 개념입니다

README는 기본 조회에 인증이 필요 없다고 설명하며, 더 높은 요청 한도를 원하는 경우는 예외로 언급합니다. 이 문구가 식별 헤더를 생략해도 된다는 의미는 아닙니다. X-Super-Client와 X-Super-Contact는 변경 안내나 과도한 호출 문제 발생 시 앱과 개발자를 식별하기 위한 정보입니다. 한도 상향 절차나 보장 수치는 이 README에 구체적으로 설명되어 있지 않습니다. [2]

### api.helldivers2.dev는 고정 인증 문자열이 아닙니다

README에서 X-Super-Client 값은 자신의 애플리케이션 이름 또는 도메인이며, api.helldivers2.dev는 예시입니다. 현재 문서의 호출 예시는 사용자가 지정했고 성공한 값을 그대로 유지했습니다. 프로젝트 이름이나 도메인이 정해지면 실제 앱을 식별하는 값으로 설정하는 것이 문서 취지에 맞습니다. [2, 3]

| 근거 | 헤더 요구에 관한 내용 |
| --- | --- |
| README 안내 | 두 헤더가 현재 필수가 아니며 Client는 향후 필수화 예정이라고 설명. Contact는 선택 정보로 안내 |
| OpenAPI 정의 | 각 작업의 security에 Client와 Contact를 함께 선언 |
| 앞선 서버 실측 | Client만 전송하면 오류. Contact를 빈 값으로 추가하면 /api/v1/war에서 200 성공 |

따라서 연동 시에는 실측된 두 헤더 전송 방식을 따릅니다. README의 선택 사항 안내는 현재 확인한 서버 동작을 반영하지 못합니다. 빈 Contact 허용 여부와 연락처를 제공하려는 운영 취지는 구분해야 합니다. [1-3]

### 원본 데이터도 커뮤니티 API를 통해 조회합니다

프로젝트는 커뮤니티 API와 내부에서 사용하는 Arrowhead API의 OpenAPI 문서를 별도로 제공합니다. 운영자는 Arrowhead 서버의 추가 부하를 줄이기 위해 직접 접근보다 커뮤니티 래퍼의 /raw 경로 사용을 강하게 권장합니다. 이전 도메인이 등장하는 예시보다 현재 기본 주소 https://api.helldivers2.dev를 사용해야 합니다. [2]

### 요청 제한과 개발 참고 자료

README 기준 한도는 10초당 5회입니다. Limit는 구간 내 허용 횟수, Remaining은 남은 횟수이며, 429 응답의 Retry-After는 재요청 전 기다릴 초 수입니다. 한도가 앞으로 늘 수 있다는 문구는 현재 사용 가능한 더 높은 한도를 보장하지 않습니다. [2]

Community 목록에는 전황 기록·그래프 프로젝트, Discord 봇, OpenAPI 기반 TypeScript 생성 도구 api-wrapper가 소개됩니다. 활용 사례와 개발 참고 자료로 볼 수 있으며, 이 문서에서는 해당 도구의 현재 호환성이나 동작을 별도로 검증하지 않았습니다. [2]
