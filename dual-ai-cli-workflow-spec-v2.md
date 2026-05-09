# Dual AI CLI Workflow Orchestrator 요구사항 v2

## 1. 문서 목적

이 문서는 Claude CLI와 Codex CLI를 함께 사용하여 요구사항 명세, 개발, 코드 검수, 보완, 테스트 설계, 테스트 수행, 테스트 결과 검수까지의 개발 프로세스를 운영하기 위한 도구의 요구사항을 정리한다.

v2 문서는 기존 초안에 Claude의 검토 의견을 반영하여 다음 사항을 더 명확히 한다.

- 좌우 분할 터미널은 통신 메커니즘이 아니라 사용자 모니터링 인터페이스이다.
- 실제 협업과 자동화는 오케스트레이터와 파일 기반 작업 큐가 담당한다.
- MVP 구현 전 Claude CLI와 Codex CLI의 비대화형 실행 가능성을 반드시 검증한다.
- 구독 플랜 사용량 폭주를 막기 위한 호출 제한, 사용자 승인, 이벤트 로그를 요구사항에 포함한다.
- 워크플로우 단계는 코드에 고정하지 않고 프로젝트별 설정으로 외부화한다.

## 2. 핵심 개념

본 도구는 두 AI CLI를 하나의 개발 워크플로우 안에서 역할 분담시켜 사용한다.

- Claude CLI: 실행자
- Codex CLI: 검수자
- Orchestrator: 파일 감시, 작업 배정, 상태 관리, 실행 제한, 이벤트 기록 담당
- User: 최종 승인권자

중요한 점은 Claude와 Codex가 직접 서로 대화하거나 세션을 공유하는 것이 아니라는 점이다.

실제 구조는 다음과 같다.

```text
사용자
  ↓
.ai-workflow/shared/requirements.md
  ↓
오케스트레이터
  ↓
Codex CLI 비대화형 호출
  ↓
.ai-workflow/outbox/codex/*.md
  ↓
오케스트레이터
  ↓
Claude CLI 비대화형 호출
  ↓
.ai-workflow/outbox/claude/*.md
  ↓
오케스트레이터
  ↓
Codex CLI 검수 호출
```

## 3. 역할 정의

### 3.1 Claude CLI

Claude는 실행자 역할을 담당한다.

주요 책임:

- 코드 구현
- Codex 리뷰 반영
- 테스트 실행
- 실패 로그 분석
- 작업 결과 Markdown 작성

### 3.2 Codex CLI

Codex는 검수자 및 보완 지시자 역할을 담당한다.

주요 책임:

- 요구사항 검토
- 구현 지시 작성
- 코드 리뷰
- 누락 요구사항 확인
- 테스트 케이스 작성
- 테스트 시나리오 작성
- 테스트 결과 검수
- Claude에게 보완 지시 작성

### 3.3 Orchestrator

오케스트레이터는 실제 자동화의 중심이다.

주요 책임:

- `.ai-workflow` 폴더 감시
- 새 Markdown 작업 파일 감지
- 대상 에이전트 판별
- Claude CLI 또는 Codex CLI 비대화형 호출
- 작업 상태 갱신
- lock 파일 관리
- 이벤트 로그 기록
- 반복 루프 제한
- 사용자 승인 게이트 관리
- 상태 대시보드 갱신

## 4. 좌우 분할 터미널의 역할

좌우 분할 터미널은 Claude와 Codex 사이의 통신 수단이 아니다.

Windows Terminal의 split pane은 단지 여러 셸 프로세스를 한 화면에 보여주는 기능이며, 패널 간 데이터 교환이나 세션 공유를 제공하지 않는다.

따라서 좌우 분할 화면의 목적은 다음으로 제한한다.

- 사용자가 Claude CLI와 Codex CLI를 동시에 확인
- 필요 시 수동 개입
- 각 CLI의 로그인 상태 확인
- 수동 명령 실행
- 디버깅 및 모니터링

실제 자동 협업은 다음 요소가 담당한다.

- Node.js 또는 PowerShell 기반 오케스트레이터
- `.ai-workflow` 파일 큐
- Markdown 작업 파일
- 상태 파일
- 이벤트 로그

## 5. 권장 화면 구성

사용자는 코딩 초보에 가깝기 때문에 상태 정보가 상시 표시되어야 한다.

초기 초안의 "각 CLI 위에 상태 패널" 방식은 Windows Terminal split pane만으로 구현하기 어렵다. 따라서 v2에서는 3분할 구성을 권장한다.

권장 비율은 `40:40:20`이다.

- 좌측 40%: Claude CLI
- 중앙 40%: Codex CLI
- 우측 20%: Status Dashboard 및 Context Ledger Viewer

```text
┌────────────────────────────────────┬────────────────────────────────────┬──────────────────┐
│ Claude CLI                         │ Codex CLI                          │ Status / Context │
│                                    │                                    │ Ledger Viewer    │
│ 구현 / 수정 / 테스트 실행          │ 검수 / 보완 지시 / 테스트 설계     │ 진행 내역        │
│                                    │                                    │ 재개 정보        │
└────────────────────────────────────┴────────────────────────────────────┴──────────────────┘
```

### 5.1 상태 대시보드 표시 항목

상태 대시보드는 우측 20% pane 또는 별도 창에서 상시 표시한다.

표시 항목:

- 프로젝트 이름
- 작업 폴더 경로
- GitHub 저장소 URL
- 현재 브랜치
- 변경 파일 수
- 현재 워크플로우 단계
- 다음 담당자
- 최근 이벤트
- 현재 처리 중인 작업 ID
- 누적 Claude 호출 수
- 누적 Codex 호출 수
- 일일 호출 제한 대비 사용량
- 추정 사용량 또는 수동 입력 사용량
- 설치 명령어
- 개발 서버 실행 명령어
- 테스트 명령어
- 린트 명령어
- 빌드 명령어
- 현재까지의 진행 내역 요약
- 중단 전 마지막 작업
- 재개 시 읽어야 할 컨텍스트 파일 경로

### 5.2 CLI별 표시 정보

가능한 경우 각 영역 또는 상태 대시보드에 다음 정보를 표시한다.

Claude:

- 역할: Executor
- CLI 명령어
- 로그인 상태
- 모델명
- 컨텍스트 크기
- 사용량 또는 잔여량
- 최근 작업 파일
- 최근 결과 파일

Codex:

- 역할: Reviewer
- CLI 명령어
- 로그인 상태
- 모델명
- 컨텍스트 크기
- 사용량 또는 잔여량
- 최근 리뷰 대상
- 최근 테스트 계획 파일

모델명, 컨텍스트 크기, 토큰 잔여량은 CLI에서 공식적으로 조회 가능한 경우에만 자동 표시한다. 공식 조회 방법이 없으면 `unknown`, `manual`, `CLI status에서 확인 필요`로 표시한다.

### 5.3 수동 전달 보완장치

각 에이전트는 자신의 결과 화면 또는 결과 Markdown에 반드시 다음 정보를 명확히 남겨야 한다.

- 사용자가 반대쪽 에이전트 화면에 그대로 붙여넣을 수 있는 지시문
- 반대쪽 에이전트가 읽어야 할 Markdown 파일 경로
- 현재 작업의 요약
- 다음 담당 에이전트

이 요구사항의 목적은 자동 파일 감시, 비대화형 호출, 오케스트레이터 디스패치가 실패했을 때도 사용자가 복사 후 붙여넣기만으로 워크플로우를 수동 진행할 수 있게 하는 것이다.

반대쪽 에이전트에게 전달해야 하는 핵심 지시문은 반드시 큰따옴표 안에 작성한다.

예시:

```markdown
## Manual Handoff

Next Agent: codex

Paste This:

"다음 파일을 읽고 Claude의 구현 결과를 검수해줘: .ai-workflow/outbox/claude/2026-05-09-001-result.md"

Context File:

.ai-workflow/shared/context-ledger.md
```

오케스트레이터는 가능하면 이 `Manual Handoff` 블록을 우측 20% 상태 대시보드에도 표시한다.

사용자는 자동화가 멈춘 경우에도 해당 문구를 복사해 반대쪽 CLI 화면에 붙여넣는 방식으로 작업을 계속 진행할 수 있어야 한다.

## 6. 권장 기술 스택

Windows 10/11을 우선 지원한다.

권장 조합:

- Windows Terminal
- PowerShell 7 이상
- Node.js CLI 오케스트레이터
- PowerShell 보조 스크립트
- Git CLI

`cmd.exe`는 권장하지 않는다.

이유:

- 파일 감시가 어렵다.
- JSON/YAML 처리가 불편하다.
- 프로세스 제어가 제한적이다.
- 향후 macOS/Linux 이식성이 낮다.

PowerShell 7은 .NET 기반 `FileSystemWatcher`, 객체 처리, JSON 처리, 크로스플랫폼 실행이 가능하므로 Windows 중심 도구의 기본 셸로 적합하다.

## 7. MVP 전 필수 검증

MVP 구현 전에 Claude CLI와 Codex CLI 각각에 대해 비대화형 실행 가능성을 검증해야 한다.

검증 결과는 별도 문서인 `.ai-workflow/verification.md` 또는 `docs/cli-verification.md`에 기록한다.

### 7.1 검증 항목

각 CLI에 대해 다음을 검증한다.

- 비대화형 단일 프롬프트 실행이 가능한가
- 입력 파일 내용을 프롬프트로 전달할 수 있는가
- 결과를 stdout 또는 파일로 안정적으로 받을 수 있는가
- 종료 코드가 신뢰 가능한가
- 타임아웃 시 강제 종료가 가능한가
- 로그인 세션이 만료되었을 때 감지 가능한가
- 작업 디렉터리를 지정할 수 있는가
- 승인 프롬프트가 발생할 경우 자동화가 멈추는가

### 7.2 검증 예시 형식

```markdown
# CLI Verification

## Claude CLI

### Command Tested

claude -p "Say hello and exit"

### Result

success

### Stdout Capturable

yes

### Exit Code Reliable

yes

### Notes

...

## Codex CLI

### Command Tested

codex exec "Say hello and exit"

### Result

pending

### Stdout Capturable

pending

### Exit Code Reliable

pending

### Notes

...
```

이 검증이 끝나기 전에는 자동화 루프 구현을 시작하지 않는다.

## 8. 파일 기반 협업 구조

프로젝트 루트에 `.ai-workflow` 폴더를 생성한다.

```text
project-root/
  .ai-workflow/
    config.yml
    phases.yml
    events.jsonl
    shared/
      requirements.md
      status.md
      context-ledger.md
      history.md
      decisions.md
    inbox/
      claude/
      codex/
    outbox/
      claude/
      codex/
    archive/
      claude/
      codex/
    decisions/
      pending/
      resolved/
```

### 8.1 폴더 역할

- `.ai-workflow/shared`: 공통 요구사항, 상태, 결정 사항, 이력 저장
- `.ai-workflow/shared/context-ledger.md`: 처음부터 현재까지의 맥락, 결정, 진행 내역을 서기관처럼 누적 기록
- `.ai-workflow/inbox/claude`: Claude가 처리해야 할 작업 파일
- `.ai-workflow/inbox/codex`: Codex가 처리해야 할 작업 파일
- `.ai-workflow/outbox/claude`: Claude가 완료한 작업 결과
- `.ai-workflow/outbox/codex`: Codex가 완료한 검수 및 지시 결과
- `.ai-workflow/archive`: 완료된 작업 파일 보관
- `.ai-workflow/decisions/pending`: 사용자 결정이 필요한 충돌 또는 승인 요청
- `.ai-workflow/decisions/resolved`: 사용자가 답변한 결정 사항
- `.ai-workflow/events.jsonl`: 모든 이벤트 로그

## 9. Markdown 작업 파일 형식

각 작업은 Markdown 파일 하나로 표현한다.

각 작업 파일과 결과 파일에는 자동화 실패 시 사용자가 수동으로 이어갈 수 있도록 `Manual Handoff` 섹션을 포함한다.

```markdown
# Task: 로그인 기능 구현

## Task ID

2026-05-09-001

## Target Agent

claude

## Requested By

codex

## Phase

implementation

## Decision Authority

user

## Retry Count

0

## Linked Tasks

- parent: 2026-05-09-000
- child: none

## Context Files

- .ai-workflow/shared/requirements.md
- .ai-workflow/outbox/codex/2026-05-09-000-requirements-review.md

## Instructions

로그인 기능을 구현한다.

## Completion Criteria

- 사용자가 이메일과 비밀번호로 로그인할 수 있다.
- 로그인 실패 시 명확한 오류 메시지가 표시된다.
- 기존 테스트가 깨지지 않는다.
- 관련 테스트가 추가되거나 수동 테스트 결과가 기록된다.

## Expected Output

- 변경된 코드
- 구현 요약
- 변경 파일 목록
- 테스트 실행 여부
- 후속 검토가 필요한 사항

## Cost Estimate

- expected_calls: 1
- expected_time_minutes: 10
- expected_token_level: medium

## Completion File

.ai-workflow/outbox/claude/2026-05-09-001-result.md

## Manual Handoff

Next Agent: codex

Paste This:

"다음 파일을 읽고 Claude의 구현 결과를 검수해줘: .ai-workflow/outbox/claude/2026-05-09-001-result.md"

Context File:

.ai-workflow/shared/context-ledger.md
```

## 10. Context Ledger

`context-ledger.md`는 워크플로우의 맥락을 잃지 않기 위한 서기관 역할의 Markdown 파일이다.

PowerShell, Windows Terminal, 오케스트레이터, Claude CLI, Codex CLI 중 어느 하나가 종료되더라도 사용자는 이 파일을 읽고 현재 상황을 복원할 수 있어야 한다.

위치:

```text
.ai-workflow/shared/context-ledger.md
```

### 10.1 기록 목적

`context-ledger.md`의 목적은 다음이다.

- 처음 요구사항부터 현재까지의 진행 내역 보존
- 각 단계의 핵심 결정 기록
- Claude와 Codex가 만든 주요 산출물 경로 기록
- 현재 작업 상태와 다음 액션 기록
- 자동화 실패 시 수동 재개에 필요한 최소 맥락 제공
- 나중에 오케스트레이터를 다시 실행했을 때 이어서 작업할 수 있는 기준점 제공

### 10.2 기록 항목

`context-ledger.md`에는 다음 항목을 누적 기록한다.

- 프로젝트 이름
- 작업 폴더
- Git 저장소 및 브랜치
- 최초 요구사항 요약
- 현재 워크플로우 단계
- 완료된 작업 목록
- 진행 중인 작업 ID
- 마지막 성공 이벤트
- 마지막 실패 이벤트
- 중요한 결정 사항
- Claude가 남긴 최근 결과 파일
- Codex가 남긴 최근 리뷰 파일
- 다음 담당 에이전트
- 다음 에이전트에게 전달할 수동 지시문
- 재개 시 먼저 읽어야 할 파일 목록

### 10.3 예시

```markdown
# Context Ledger

## Project

- Name: my-project
- Workspace: C:\work\my-project
- Repo: github.com/user/my-project
- Branch: feature/login-flow

## Current State

- Phase: code_review
- Last Actor: claude
- Next Actor: codex
- Current Task: 2026-05-09-001

## Narrative

사용자는 로그인 기능 구현을 요청했다. Codex가 요구사항을 검토했고, Claude가 구현을 완료했다. 현재 Codex가 Claude 결과를 검수해야 한다.

## Important Files

- Requirements: .ai-workflow/shared/requirements.md
- Claude Result: .ai-workflow/outbox/claude/2026-05-09-001-result.md
- Status: .ai-workflow/shared/status.md

## Manual Handoff

"다음 파일을 읽고 Claude의 구현 결과를 검수해줘: .ai-workflow/outbox/claude/2026-05-09-001-result.md"

## Resume Instructions

오케스트레이터가 중단되었다면 `dual-ai resume`을 실행한다. 수동으로 진행해야 한다면 위 Manual Handoff 문구를 Codex CLI 화면에 붙여넣는다.
```

### 10.4 재개 요구사항

오케스트레이터는 시작 시 다음 파일을 읽어 현재 맥락을 복원한다.

- `.ai-workflow/shared/status.md`
- `.ai-workflow/shared/context-ledger.md`
- `.ai-workflow/events.jsonl`
- `.ai-workflow/config.yml`
- `.ai-workflow/phases.yml`

`dual-ai resume`은 위 파일들을 바탕으로 마지막 작업, 다음 담당 에이전트, 필요한 수동 전달 문구를 표시해야 한다.

## 11. 프로젝트별 워크플로우 외부화

워크플로우 단계는 코드에 하드코딩하지 않는다.

프로젝트마다 `.ai-workflow/phases.yml`을 통해 단계를 정의한다.

예시:

```yaml
phases:
  - id: requirements_review
    actor: codex
    input_path: shared/requirements.md
    output_path: outbox/codex
    next: implementation
    requires_user_approval: true

  - id: implementation
    actor: claude
    input_path: inbox/claude
    output_path: outbox/claude
    next: code_review
    requires_user_approval: false

  - id: code_review
    actor: codex
    input_path: outbox/claude
    output_path: outbox/codex
    next_on_approved: test_plan
    next_on_changes_requested: revision
    requires_user_approval: true

  - id: revision
    actor: claude
    input_path: inbox/claude
    output_path: outbox/claude
    next: code_review
    max_loops: 3

  - id: test_plan
    actor: codex
    input_path: outbox/claude
    output_path: outbox/codex
    next: test_execution

  - id: test_execution
    actor: claude
    input_path: inbox/claude
    output_path: outbox/claude
    next: test_review

  - id: test_review
    actor: codex
    input_path: outbox/claude
    output_path: outbox/codex
    next_on_approved: done
    next_on_changes_requested: revision
```

이 구조를 사용하면 일반 웹앱, 라이브러리, 시뮬레이션, 데이터 분석 프로젝트마다 다른 단계를 정의할 수 있다.

## 12. 이벤트 로그

모든 주요 동작은 `.ai-workflow/events.jsonl`에 기록한다.

한 줄에 JSON 객체 하나를 기록한다.

예시:

```json
{"time":"2026-05-09T14:30:00+09:00","type":"task_detected","task_id":"2026-05-09-001","agent":"claude","path":".ai-workflow/inbox/claude/2026-05-09-001.md"}
{"time":"2026-05-09T14:30:03+09:00","type":"agent_started","task_id":"2026-05-09-001","agent":"claude","command":"claude -p <task>"}
{"time":"2026-05-09T14:36:41+09:00","type":"agent_completed","task_id":"2026-05-09-001","agent":"claude","exit_code":0,"output":".ai-workflow/outbox/claude/2026-05-09-001-result.md"}
```

기록할 이벤트:

- 작업 파일 감지
- lock 생성
- 에이전트 호출 시작
- 에이전트 호출 완료
- 에이전트 호출 실패
- 타임아웃
- 사용자 승인 요청
- 사용자 승인 완료
- 재시도
- 최대 루프 초과
- 충돌 감지
- 워크플로우 완료
- context-ledger 갱신
- 수동 전달 문구 생성

## 13. 사용량 및 구독 한도 관리

본 도구는 API 과금이 아니라 사용자의 Claude 및 ChatGPT/Codex 구독 플랜 내 사용을 전제로 한다.

따라서 자동 루프가 구독 한도를 빠르게 소모하지 않도록 제한이 필요하다.

필수 정책:

- 자동 진행은 기본 OFF
- `--auto` 플래그가 있을 때만 다음 단계 자동 진행
- 단계 전환마다 사용자 승인 기본 ON
- 일일 Claude 호출 상한 설정
- 일일 Codex 호출 상한 설정
- 작업별 예상 호출 수 기록
- 누적 호출 수 상태 대시보드 표시
- max_revision_loops 적용
- 한도 초과 예상 시 진행 중단 및 사용자 확인 요청

설정 예시:

```yaml
limits:
  auto_mode: false
  daily_claude_calls: 20
  daily_codex_calls: 20
  max_revision_loops: 3
  require_user_approval_each_phase: true
  stop_when_limit_reached: true
```

## 14. 충돌 처리

Codex가 거부했지만 사용자가 진행하고 싶은 경우, 또는 Claude와 Codex의 판단이 충돌하는 경우 사용자 결정 게이트를 생성한다.

오케스트레이터는 `.ai-workflow/decisions/pending`에 결정 요청 Markdown을 생성한다.

예시:

```markdown
# Decision Required: Codex Review Rejected

## Decision ID

2026-05-09-D001

## Related Task

2026-05-09-001

## Situation

Codex requested additional changes, but Claude reported the implementation is complete.

## Options

- approve_as_is
- request_revision
- ask_codex_to_recheck
- stop_workflow

## User Decision

pending
```

사용자는 해당 파일에 결정을 작성하거나 `dual-ai decide` 명령으로 처리한다.

## 15. 설정 파일

전역 설정과 프로젝트 설정을 분리한다.

전역 설정:

```text
~/.dual-ai/global.yml
```

프로젝트 설정:

```text
project-root/.ai-workflow/config.yml
```

예시:

```yaml
project_name: my-project

agents:
  claude:
    role: executor
    command: claude
    non_interactive_args: ["-p"]
    model: manual
    context_size: manual

  codex:
    role: reviewer
    command: codex
    non_interactive_args: ["exec"]
    model: manual
    context_size: manual

paths:
  requirements: .ai-workflow/shared/requirements.md
  status: .ai-workflow/shared/status.md
  context_ledger: .ai-workflow/shared/context-ledger.md
  events: .ai-workflow/events.jsonl
  phases: .ai-workflow/phases.yml

commands:
  install: npm install
  dev: npm run dev
  test: npm test
  lint: npm run lint
  build: npm run build

limits:
  auto_mode: false
  daily_claude_calls: 20
  daily_codex_calls: 20
  max_revision_loops: 3
  require_user_approval_each_phase: true
  stop_when_limit_reached: true

handoff:
  require_manual_handoff_block: true
  require_quoted_paste_instruction: true
  show_handoff_in_dashboard: true
```

## 16. CLI 명령어

도구 이름 예시: `dual-ai`

필수 명령:

```bash
dual-ai init
dual-ai verify
dual-ai start
dual-ai status
dual-ai next
dual-ai pause
dual-ai resume
dual-ai dry-run
dual-ai resume-from <task-id>
dual-ai context
dual-ai cost-report
dual-ai reset
```

명령어 설명:

- `dual-ai init`: `.ai-workflow` 구조와 기본 설정 생성
- `dual-ai verify`: Claude CLI와 Codex CLI 비대화형 실행 가능성 검증
- `dual-ai start`: Windows Terminal 3분할 화면과 파일 감시 시작
- `dual-ai status`: 현재 상태 출력
- `dual-ai next`: 다음 단계로 수동 진행
- `dual-ai pause`: 자동 트리거 중지
- `dual-ai resume`: 자동 트리거 재개
- `dual-ai dry-run`: 실제 CLI 호출 없이 작업 라우팅 시뮬레이션
- `dual-ai resume-from <task-id>`: 특정 작업 ID부터 재개
- `dual-ai context`: `context-ledger.md`를 요약 표시하고 수동 전달 문구를 출력
- `dual-ai cost-report`: 누적 호출 수와 추정 사용량 리포트 출력
- `dual-ai reset`: 상태 초기화

## 17. MVP 범위

MVP에서 구현한다.

- Windows 10/11 우선 지원
- PowerShell 7 권장
- Node.js 기반 CLI
- `.ai-workflow` 폴더 생성
- `config.yml`, `phases.yml`, `events.jsonl` 생성
- Claude/Codex 비대화형 실행 검증 명령
- 파일 감시
- Markdown 작업 큐
- lock 파일
- 상태 파일 갱신
- 이벤트 로그 기록
- 3분할 Windows Terminal 실행
- 40:40:20 화면 비율
- 우측 20% Status Dashboard 및 Context Ledger Viewer
- context-ledger.md 생성 및 갱신
- Manual Handoff 블록 생성
- 수동 복사/붙여넣기용 큰따옴표 지시문 표시
- 사용자 승인 기반 단계 전환
- 일일 호출 수 제한
- dry-run

MVP에서 제외한다.

- Claude와 Codex의 직접 세션 공유
- 터미널 화면 텍스트를 긁어 다른 CLI에 자동 입력
- 인증 토큰, 쿠키, 세션 파일 직접 접근
- 완전 자동 commit/push
- 완전 무인 장시간 자동 루프
- 정확한 토큰 잔여량 강제 자동 조회

## 18. 구현 순서

### 1단계: CLI 검증

`dual-ai verify`에 해당하는 실험을 먼저 수행한다.

검증 대상:

- Claude CLI
- Codex CLI
- stdout 캡처
- 종료 코드
- timeout
- 작업 디렉터리 지정
- 로그인 만료 처리

### 2단계: 요구사항 v3 확정

검증 결과를 반영해 명령어와 실행 방식을 확정한다.

### 3단계: `dual-ai init`

`.ai-workflow` 구조와 템플릿을 생성한다.

### 4단계: 파일 감시, context-ledger, dry-run

실제 AI 호출 없이 파일 라우팅, 상태 갱신, context-ledger 갱신, Manual Handoff 블록 생성, 이벤트 로그를 먼저 구현한다.

### 5단계: Claude/Codex 호출 연결

검증된 비대화형 명령을 연결한다.

### 6단계: Windows Terminal 3분할 UI

좌측 Claude 40%, 중앙 Codex 40%, 우측 Status Dashboard 및 Context Ledger Viewer 20%를 실행한다.

### 7단계: 사용량 제한과 승인 게이트

자동 루프 제한, 사용자 승인, cost-report를 구현한다.

## 19. 현재 결론

이 도구는 기술적으로 구현 가능하다.

다만 MVP의 본질은 "Claude와 Codex가 같은 터미널 안에서 직접 대화하는 것"이 아니다.

MVP의 본질은 다음이다.

```text
Node.js Orchestrator
+ PowerShell 7
+ Windows Terminal 3분할 UI
+ .ai-workflow 파일 큐
+ Markdown 작업 파일
+ Claude 비대화형 실행
+ Codex 비대화형 실행
+ 상태 대시보드
+ 이벤트 로그
+ context-ledger.md
+ Manual Handoff 블록
+ 사용자 승인 게이트
+ 구독 사용량 보호
```

가장 먼저 해야 할 일은 `dual-ai verify` 수준의 CLI 비대화형 실행 검증이다.

이 검증이 성공하면 파일 기반 듀얼 AI 개발 워크플로우는 충분히 현실적인 MVP로 진행할 수 있다.
