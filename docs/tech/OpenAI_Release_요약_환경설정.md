# OpenAI Release 요약 환경 설정

- 작성일: 2026-09-13
- 관련 Task Spec: `docs/task_specs/005_OpenAI_Release_요약_한글화_출력.md`
- 상태: 애플리케이션 구현 및 로컬 실연동 검증 완료

## 목적

`technology_releases.description`을 OpenAI Responses API로 요약·한글화할 때 필요한
server 환경 변수를 설명한다. 실제 API key는 이 문서나 repository에 기록하지 않는다.

## 필수 환경 변수

```dotenv
OPENAI_API_SECRET_KEY=replace_with_your_openai_api_key
OPENAI_MODEL=gpt-5.6-terra
```

- `OPENAI_API_SECRET_KEY`: OpenAI API 인증에 사용하는 비밀값이다. server에서만 읽으며 client에 전달하지 않는다. 애플리케이션은 이 사용자 정의 변수 값을 OpenAI SDK client의 `apiKey`에 명시적으로 전달한다.
- `OPENAI_MODEL`: Responses API 요청에 사용할 model ID다. source code에 model을 고정하지 않고 실행 환경에서 선택한다.

초기 권장값은 `gpt-5.6-terra`다. 공식 OpenAI 문서는 이 model을 품질과 비용의 균형을 위한 선택지로 안내한다.
비용 우선 환경에서는 project 접근 가능 여부와 요약 품질을 검증한 뒤 `gpt-5.6-luna`를 선택할 수 있다.

## 로컬 실행

`web/.env`를 사용하는 경우 위 두 변수를 추가한다. 실제 secret이 포함된 `web/.env`는 commit하지 않는다.

설정 후 애플리케이션은 다음 원칙으로 값을 사용한다.

1. `OPENAI_API_SECRET_KEY`와 `OPENAI_MODEL`이 모두 존재하는지 server에서 확인한다.
2. `OPENAI_MODEL` 값을 Responses API의 `model`에 전달한다.
3. 요약 요청의 `max_output_tokens`는 `2,000`으로 제한한다.
4. 환경 변수가 없거나 model을 사용할 수 없으면 요약을 실패 상태로 남기고 Release 원문은 보존한다.

애플리케이션은 `OPENAI_MODEL`을 읽어 Responses API 요청에 전달한다. `gpt-5.6-terra`를 사용한
unit test와 실제 API 호출은 2026-09-13에 검증했으며, 다른 model로 변경하면 같은 검증을 다시 수행한다.

## Docker Compose 실행

`web/.env`에 두 변수를 설정한다. `compose.yaml`은 `web.env_file`을 통해 이 파일을
`web` container에 전달하며, 파일이 없는 환경에서는 Compose 구성 자체가 실패하지 않도록 optional로 취급한다.

구현 후에는 실제 값을 출력하지 않고 container 내부에서 설정 여부만 확인한다. 환경 변수를 변경한 뒤에는
`web` container를 다시 생성해야 변경값이 반영된다.

## model 변경

`OPENAI_MODEL`을 변경할 때는 다음 항목을 확인한다.

- 해당 OpenAI project에서 model을 사용할 수 있는지
- Responses API와 필요한 text output을 지원하는지
- 같은 대표 Release 입력에서 한글 요약 품질과 기술 식별자 보존이 유지되는지
- latency, input/output token 사용량과 비용이 허용 범위인지
- 일반 Release 3~5개 bullet, 대규모 Release 최대 10개 bullet 규칙을 지키는지

model 변경은 DB migration을 필요로 하지 않는다. 이미 non-null인 `summary`는 자동으로 재생성하지 않으므로,
기존 요약까지 새 model로 바꾸는 작업은 별도 범위로 다룬다.

## 요약 길이 정책

- 일반 Release: 핵심 변경 3~5개 bullet
- 대규모 Release: Breaking Changes, 보안, 주요 기능, 성능, migration 등 주제별로 묶어 최대 10개 bullet
- 우선순위: 호환성 파괴, 보안, migration 필요 사항, 사용자 영향이 큰 기능, 성능 순
- hard limit: Responses API `max_output_tokens: 2000`

`max_output_tokens`는 실제로 반드시 생성할 길이가 아니라 생성 가능한 상한이다. OpenAI Responses API에서는
visible output token과 reasoning token이 모두 이 상한에 포함되므로 지나치게 낮은 값은 응답을 불완전하게 만들 수 있다.

## 참고 자료

- [OpenAI API Reference - Create a model response](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [OpenAI API - Models](https://developers.openai.com/api/docs/models)
