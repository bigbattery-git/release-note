# 003. Agent harness 구성

- 작업일: 2026-09-10
- 작업 범위: 저장소 전용 `AGENTS.md`, skills, subagents, hooks 구성
- 기록 기준: 현재 작업 대화, commit `c284cb3`, commit `32132d1`, 최종 파일 및 로컬 검증 결과

## 1. 작업 목적

GitHub Repository의 Release를 주기적으로 수집하고 OpenAI API로 정리하는 웹사이트 개발에 사용할 저장소 전용 agent harness를 구성했다. 프로젝트 목표와 작업 제약을 모든 agent가 일관되게 따르게 하고, 반복 작업은 skill로, 독립적으로 위임할 구현·조사·검토 역할은 subagent로 분리하는 것이 목적이었다.

## 2. 수행한 작업과 선택 이유

### 프로젝트 지침

루트 `AGENTS.md`에 다음 내용을 정리했다.

- GitHub Repository 등록, 신규 Release 감지·저장, OpenAI API 기반 요약이라는 제품 목표
- Next.js, Node.js, MariaDB 기본 기술 구성
- 기록은 한글로 작성하되 기술명, 고유명사, 코드 식별자, 경로와 명령어는 영어 원문을 유지하는 규칙
- UI 디자인과 스타일링은 Tailwind CSS를 사용하고 예외는 사전 승인을 받는 규칙
- 라이브러리 설치, 아키텍처 변경, 파일 분할과 리팩터링 전에 이유·대안·영향을 설명하고 동의를 받는 규칙
- 질문에는 코드나 파일을 변경하지 않고 답변만 제공하는 규칙

규칙은 행동 기준을 빠르게 구분할 수 있도록 `지켜야 할 것`과 `하면 안 되는 것`으로 나눴다.

### Harness 공통 구조와 hooks

`.agents/AGENTS.md`에 skill, subagent, hook 자산의 위치와 작성 기준을 정의했다. 특정 harness 제품의 확인되지 않은 manifest 형식을 만들지 않고, hooks는 명시적으로 runner에 연결하는 방식으로 남겼다.

- `pre-task.ps1`: 루트와 `.agents/`의 필수 `AGENTS.md` 존재 여부 확인
- `post-task.ps1`: `git diff --check` 실행
- `HOOKS.md`: 두 hook의 호출 명령과 연결 계약 기록

### Skills

반복되는 요청별 판단 절차를 다섯 개의 skill로 분리했다.

| Skill | 역할 | 변경 제한 |
| --- | --- | --- |
| `repository-checks` | 변경 영역에 맞는 기존 검증 명령 선택 | 존재하지 않는 검증을 성공으로 기록하지 않음 |
| `deploy-readiness` | lint, typecheck, test, build를 이용해 배포 준비 상태 판정 | 자동 수정, 설치, migration, 실제 배포 금지 |
| `acceptance-criteria` | 테스트·검수 요청에서 관찰 가능한 acceptance 조건 제시 | 테스트 구현과 코드 변경 금지 |
| `task-spec-authoring` | 대략적인 요청을 구현 가능한 Task Spec으로 정리 | 문서 작성 후 구현을 자동으로 시작하지 않음 |
| `conversation-work-log` | 현재 대화의 Work Log 작성과 기존 로그의 이력 기반 보완 | Work Log 외의 코드와 설정 변경 금지 |

### Subagents

웹사이트 운영 기능이 아니라 개발 과정에서 독립적으로 위임할 책임을 기준으로 여섯 역할을 구성했다.

| Subagent | 담당 범위 |
| --- | --- |
| `architecture-advisor` | 구조, 의존성, 책임 경계 분석과 승인용 제안 |
| `backend-engineer` | GitHub Release 수집, scheduler, OpenAI API 연동과 서버 기능 구현 |
| `database-engineer` | MariaDB schema, 저장 계층, 중복 방지와 데이터 일관성 |
| `frontend-engineer` | Next.js 기반 Repository 등록과 Release·요약 화면 구현 |
| `technology-researcher` | 기술의 공식 GitHub Repository와 Release 제공 여부 조사 |
| `reviewer` | 결함, 회귀, 검증 누락과 승인되지 않은 구조·의존성 변경 검토 |

OpenAI API 연동만 담당하는 `release-summarizer`는 운영 중 동작하는 기능처럼 오해될 수 있어 별도 subagent로 만들지 않았다. 현재 단계에서는 `backend-engineer`가 해당 구현을 담당하고, 복잡도가 커질 때만 전문 역할 분리를 검토하기로 했다.

## 3. 발생한 문제와 해결 과정

### 문제 A. 루트 AGENTS.md의 기준 불일치와 누락

**증상:** 초기 저장소에는 이전 Helldivers 2 MCP 방향의 지침이 있었고, 이후 루트 `AGENTS.md`가 없는 상태가 확인됐다.

**조사와 근거:** 사용자는 작업 전에 `git pull`을 하지 않은 상태에서 기존 파일을 삭제했다고 설명했고, 저장소 루트 조회에서도 파일 부재를 확인했다.

**원인:** 최신 저장소 상태가 반영되기 전에 이전 프로젝트 방향을 기준으로 harness 준비를 시작했다.

**해결:** 사용자가 현재 제품 목표와 제약을 다시 제공한 뒤 루트 `AGENTS.md`를 새 기준으로 작성했다. 이후 기록 언어와 Tailwind CSS 규칙을 추가하고, 작업 규칙을 두 문단으로 재구성했다.

**재검증:** 최종 `AGENTS.md` 내용을 다시 읽고 제품 목표, 기술 구성, 사전 승인과 금지 규칙이 반영됐는지 확인했다.

### 문제 B. Skill 공식 validator 실행 불가

**증상:** `quick_validate.py`로 skill을 확인하려 했으나 기본 `python` 명령을 찾을 수 없었다. bundled Python으로 다시 실행했을 때는 `PyYAML` module이 없어 validator가 시작되지 않았다.

**조사와 근거:** 두 실행에서 각각 command not found와 `ModuleNotFoundError: No module named 'yaml'`을 확인했다.

**원인:** 현재 로컬 환경에 validator가 요구하는 Python 실행 경로와 `PyYAML` 의존성이 준비되지 않았다.

**해결:** 새 의존성을 임의로 설치하지 않고 PowerShell 검사로 폴더 이름, YAML frontmatter의 `name`과 `description`, subagent의 필수 문단을 확인했다.

**재검증:** 추가한 skills와 여섯 subagent 정의가 수동 형식 검사를 통과했고 `git diff --check`도 통과했다. 공식 validator는 실행하지 못했으므로 해당 검사를 통과했다고 기록하지 않는다.

## 4. 검증 결과와 남은 확인

| 항목 | 방법·환경 | 결과 및 한계 |
| --- | --- | --- |
| Hook 기본 동작 | Windows PowerShell에서 `pre-task.ps1`, `post-task.ps1` 직접 실행 | 두 script 모두 성공 |
| Markdown diff | 저장소 루트에서 `git diff --check` 실행 | 오류 없음 |
| Skill 형식 | PowerShell로 경로, 이름, YAML frontmatter 검사 | 추가한 skill 형식 통과, 공식 validator 미실행 |
| Subagent 형식 | PowerShell로 frontmatter와 역할·금지·입력·반환 문단 검사 | 여섯 정의 모두 통과 |
| 최종 저장 상태 | `git status --short`, commit `c284cb3`, `32132d1` 확인 | harness 변경 commit 완료, Work Log 작성 전 작업 트리 clean |

Hooks는 script를 직접 실행해 검증했지만 실제 harness runner에 자동 연결하지 않았다. Skill의 실제 trigger 선택과 subagent 위임 결과도 아직 end-to-end로 검증하지 않았다. 향후 실제 요청에서 호출 여부와 반환 품질을 확인하고 필요한 범위만 보완해야 한다.

## 5. 이번 작업에서 얻은 점

- Subagent는 웹사이트 운영 중 동작하는 서비스가 아니라 개발 과정에서 독립적으로 위임할 작업자 역할로 정의해야 한다.
- 반복 요청의 처리 절차는 skill에, 구현·조사·검토처럼 독립 실행할 책임은 subagent에 두면 역할 중복을 줄일 수 있다.
- 검증 도구의 의존성이 없을 때 임의 설치하지 않고 대체 검사를 수행하되, 공식 validator를 통과한 것처럼 확대해서 기록하지 않아야 한다.
- 특정 harness 설정 형식이 확정되지 않았다면 추측한 manifest보다 실행 가능한 script와 명시적인 연결 계약을 먼저 두는 편이 안전하다.

## 6. 주요 변경 파일

- `AGENTS.md`: 현재 제품 목표와 프로젝트 공통 작업 규칙
- `.agents/AGENTS.md`: 저장소 전용 harness 자산 작성 규칙
- `.agents/hooks/HOOKS.md`: hook 연결 계약
- `.agents/hooks/pre-task.ps1`: 작업 전 필수 지침 파일 확인
- `.agents/hooks/post-task.ps1`: 작업 후 diff 형식 확인
- `.agents/skills/repository-checks/SKILL.md`: 저장소 검증 절차
- `.agents/skills/deploy-readiness/SKILL.md`: 배포 준비 상태 진단 절차
- `.agents/skills/acceptance-criteria/SKILL.md`: acceptance 조건 작성 절차
- `.agents/skills/task-spec-authoring/SKILL.md`: 대략적인 요청을 구현 전 Task Spec으로 정리하는 절차
- `.agents/skills/conversation-work-log/SKILL.md`: 대화 기반 Work Log 작성과 기존 로그의 변경 이력 관리 절차
- `.agents/subagents/architecture-advisor.md`: 아키텍처 분석 역할
- `.agents/subagents/backend-engineer.md`: backend 구현 역할
- `.agents/subagents/database-engineer.md`: MariaDB 구현 역할
- `.agents/subagents/frontend-engineer.md`: Next.js UI 구현 역할
- `.agents/subagents/technology-researcher.md`: GitHub Release 조사 역할
- `.agents/subagents/reviewer.md`: 읽기 전용 검토 역할

## 7. 참고 자료

- `docs/rules/work_log.md`

## 변경 이력

### 2026-09-10 - Task Spec 작성과 Work Log 수정 절차 추가

- 이전: 네 개의 skill이 있었고 `conversation-work-log`는 현재 대화의 Work Log를 새로 작성하거나 보완하는 기본 절차만 정의했다.
- 변경 내역: 대략적인 요청을 Goal, Requirements, Acceptance Criteria, Out of Scope 등으로 정리하는 `task-spec-authoring`을 추가했다. `conversation-work-log`에는 기존 Work Log 수정 시 문서 맨 아래에 `이전`과 `변경 내역`을 누적하는 규칙을 추가했다.
