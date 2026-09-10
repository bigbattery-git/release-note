# Agent harness 자산 규칙

이 디렉터리는 저장소에 함께 버전 관리하는 agent 확장점만 포함한다.

## Skills

- 각 skill은 `skills/<lowercase-kebab-name>/SKILL.md`를 진입점으로 사용한다.
- `SKILL.md`에는 YAML frontmatter의 `name`, `description`을 반드시 둔다.
- 반복 실행의 신뢰성을 높이는 경우에만 `scripts/`, 조건부 참고 자료가 필요한 경우에만 `references/`를 추가한다.

## Subagents

- `subagents/*.md`에는 역할, 맡길 수 있는 일, 맡기지 않을 일, 입력, 반환 형식을 적는다.
- 서로 독립적인 작업에만 subagent를 사용하고 동일 파일의 동시 수정을 피한다.
- subagent 결과는 주 agent가 검토하고 통합한다.

## Hooks

- Hook은 `hooks/`에 두며 기본적으로 저장소 루트에서 실행된다고 가정한다.
- Hook은 비대화형이고 반복 실행에 안전해야 하며 실패 시 0이 아닌 종료 코드를 반환한다.
- 비밀 값을 출력하거나 파일을 파괴적으로 변경하지 않는다.
- 실제 실행 여부와 이벤트 이름은 사용하는 harness 설정에서 명시적으로 연결한다.
