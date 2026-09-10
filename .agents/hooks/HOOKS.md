# Hook 연결 계약

이 폴더의 스크립트는 특정 harness 제품에 종속되지 않은 예시다. 저장소 루트에서 다음 순서로 호출할 수 있다.

| 이벤트 | 스크립트 | 목적 |
| --- | --- | --- |
| 작업 시작 전 | `pwsh -NoProfile -File .agents/hooks/pre-task.ps1` | 필수 agent 지침 파일 확인 |
| 작업 완료 후 | `pwsh -NoProfile -File .agents/hooks/post-task.ps1` | diff 공백 및 충돌 표식 검사 |

사용하는 harness가 정한 hook 설정 형식에 위 명령을 명시적으로 등록한다. 설정 형식이 확정되기 전에는 특정 제품의 manifest를 추측해 추가하지 않는다.
