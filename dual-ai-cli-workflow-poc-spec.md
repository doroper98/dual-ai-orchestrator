# Dual AI CLI Workflow Orchestrator PoC 명세서

## 1. PoC 목적

본 PoC는 Claude CLI와 Codex CLI를 API 없이 CLI 로그인 세션 기반으로 호출하여, 파일 기반 작업 큐를 통해 개발 워크플로우를 자동 또는 반자동으로 연결할 수 있는지 검증한다.

PoC의 핵심 질문은 다음이다.

- Claude CLI를 비대화형으로 호출할 수 있는가?
- Codex CLI를 비대화형으로 호출할 수 있는가?
- Markdown 작업 파일을 입력으로 전달할 수 있는가?
- CLI 실행 결과를 stdout 또는 Markdown 파일로 안정적으로 받을 수 있는가?
- 파일 생성 이벤트를 감지해 대상 CLI를 호출할 수 있는가?
- 한쪽 CLI의 결과를 다른쪽 CLI의 입력으로 넘기는 루프가 가능한가?
- 구독 플랜 사용량을 과도하게 소모하지 않도록 제한할 수 있는가?
- 자동화가 실패했을 때 사용자가 수동 복사/붙여넣기로 반대쪽 에이전트에게 작업을 넘길 수 있는가?
- 진행 맥락을 `context-ledger.md`에 기록하고, 재시작 후 이 파일을 읽어 작업을 이어갈 수 있는가?

## 2. PoC 범위

### 포함 범위

- Windows 10/11 환경
- PowerShell 7
- Node.js 기반 간단한 오케스트레이터
- `.ai-workflow` 폴더 생성
- Markdown 작업 파일 기반 입력
- Claude CLI 단일 호출 검증
- Codex CLI 단일 호출 검증
- stdout 캡처 검증
- exit code 검증
- timeout 처리 검증
- 파일 감시 기반 트리거 검증
- 간단한 Claude to Codex 또는 Codex to Claude 연계 검증
- 이벤트 로그 기록
- 호출 횟수 제한 검증
- 수동 전달 문구 검증
- `context-ledger.md` 생성 및 갱신 검증
- 재시작 후 맥락 복원 검증
- CLI 페이로드 전달 방식 검증
- 권한 승인 프롬프트 처리 방식 검증
- Windows FileSystemWatcher debounce 및 파일 안정성 검증
- prerequisites check 검증

### 제외 범위

- 완성형 제품 UI
- Windows Terminal 3분할 화면 자동 구성
- 장시간 자동 루프
- 실제 대규모 코드 수정
- Git commit, push, PR 생성
- 정확한 토큰 잔여량 측정
- 인증 토큰 또는 세션 파일 접근
- 복잡한 테스트 자동화
- 여러 프로젝트 배포 기능

## 3. 성공 기준

PoC는 다음 조건을 만족하면 성공으로 본다.

- `dual-ai-poc verify claude` 명령으로 Claude CLI 비대화형 호출이 성공한다.
- `dual-ai-poc verify codex` 명령으로 Codex CLI 비대화형 호출이 성공한다.
- Markdown 파일 내용을 CLI 프롬프트로 전달할 수 있다.
- CLI 응답을 stdout 또는 지정된 output Markdown 파일로 저장할 수 있다.
- 실행 성공 또는 실패를 exit code 또는 오류 패턴으로 판단할 수 있다.
- timeout 설정으로 멈춘 프로세스를 종료할 수 있다.
- `.ai-workflow/inbox/claude/*.md` 생성 시 Claude 작업으로 감지된다.
- `.ai-workflow/inbox/codex/*.md` 생성 시 Codex 작업으로 감지된다.
- 작업 이벤트가 `.ai-workflow/events.jsonl`에 기록된다.
- 최소 1회 이상 한쪽 CLI 결과를 다른쪽 CLI 입력으로 전달하는 데 성공한다.
- 설정된 호출 제한을 초과하면 추가 호출이 중단된다.
- 각 작업 결과에 `Manual Handoff` 블록이 생성된다.
- `Manual Handoff` 블록에는 반대쪽 에이전트에게 붙여넣을 수 있는 큰따옴표 지시문이 포함된다.
- `.ai-workflow/shared/context-ledger.md`에 현재까지의 진행 맥락이 누적 기록된다.
- 오케스트레이터 재시작 후 `context-ledger.md`와 `events.jsonl`을 읽고 마지막 작업과 다음 액션을 표시할 수 있다.
- CLI 출력은 stdout으로 캡처되고, 결과 파일 저장은 오케스트레이터가 수행한다.
- stdin 전달 방식과 인자 전달 방식 중 실제 안정적인 방식이 검증 결과로 기록된다.
- 권한 승인 프롬프트가 발생하는지, 우회 또는 중단 처리할 수 있는지 기록된다.

## 4. 실패 또는 보류 기준

다음 중 하나라도 발생하면 PoC는 실패 또는 보류로 판단한다.

- Claude CLI 또는 Codex CLI 중 하나가 비대화형 호출을 지원하지 않는다.
- CLI 응답을 안정적으로 캡처할 수 없다.
- CLI 실행 완료 여부를 판단할 수 없다.
- 로그인 세션 또는 권한 확인 화면 때문에 자동 호출이 반복적으로 중단된다.
- 작업 실행이 구독 플랜 한도를 빠르게 소모하여 실사용이 어렵다.
- 파일 감시 이벤트가 중복 실행을 자주 일으킨다.
- 실패한 작업을 재시도하거나 중단할 수 없다.
- 자동화 실패 시 사용자가 반대쪽 CLI에 붙여넣을 명확한 지시문을 얻을 수 없다.
- 오케스트레이터 재시작 후 이전 맥락을 복원할 수 없다.
- 권한 승인 프롬프트 때문에 비대화형 호출이 멈추고 이를 감지할 수 없다.
- Markdown 멀티라인 입력이 깨져 CLI에 전달된다.
- stdout 캡처가 불안정하거나 결과 파일 저장 책임이 모호하다.

## 5. PoC 폴더 구조

```text
project-root/
  .ai-workflow/
    config.yml
    events.jsonl
    verification.md
    shared/
      context-ledger.md
      status.md
    inbox/
      claude/
      codex/
    outbox/
      claude/
      codex/
    processing/
      claude/
      codex/
    archive/
      claude/
      codex/
    failed/
      claude/
      codex/
```

## 6. 설정 파일 초안

`.ai-workflow/config.yml`

```yaml
agents:
  claude:
    command: claude
    model: manual
    payload_mode: stdin
    args:
      - "-p"
    permission_args:
      - "<verification-required>"
    timeout_seconds: 300

  codex:
    command: codex
    model: manual
    payload_mode: stdin
    args:
      - "exec"
    permission_args:
      - "<verification-required>"
    timeout_seconds: 300

limits:
  max_total_calls: 10
  max_claude_calls: 5
  max_codex_calls: 5
  auto_continue: false
  retry_on_timeout: 0

watcher:
  debounce_ms: 500
  require_file_size_stable: true
  file_size_stable_ms: 500

paths:
  events: .ai-workflow/events.jsonl
  verification: .ai-workflow/verification.md
  status: .ai-workflow/shared/status.md
  context_ledger: .ai-workflow/shared/context-ledger.md
  claude_inbox: .ai-workflow/inbox/claude
  codex_inbox: .ai-workflow/inbox/codex
  claude_outbox: .ai-workflow/outbox/claude
  codex_outbox: .ai-workflow/outbox/codex
  claude_processing: .ai-workflow/processing/claude
  codex_processing: .ai-workflow/processing/codex
  claude_archive: .ai-workflow/archive/claude
  codex_archive: .ai-workflow/archive/codex
  claude_failed: .ai-workflow/failed/claude
  codex_failed: .ai-workflow/failed/codex

handoff:
  require_manual_handoff_block: true
  require_quoted_paste_instruction: true
```

## 7. 실행 방식 결정

PoC에서 가장 먼저 확정해야 하는 것은 CLI에 Markdown 페이로드를 전달하는 방식이다.

### 7.1 페이로드 전달 방식

검증 대상 방식:

- stdin 파이프
- 인자 문자열 전달
- 파일 경로 전달

PoC의 1차 기본값은 stdin 파이프이다.

이유:

- Markdown은 멀티라인 텍스트이다.
- 따옴표, 코드블록, 특수문자가 포함될 수 있다.
- PowerShell에서 멀티라인 Markdown을 하나의 인자로 넘기면 escaping 문제가 자주 발생한다.

따라서 PoC의 기본 실행 원칙은 다음이다.

```text
작업 Markdown 파일 읽기
→ stdin으로 CLI에 전달
→ CLI stdout 캡처
→ 오케스트레이터가 outbox Markdown 파일로 저장
```

인자 문자열 전달 방식과 파일 경로 전달 방식은 검증 항목으로만 남기며, stdin 방식이 실패할 경우 대안으로 검토한다.

### 7.2 결과 파일 저장 책임

PoC에서는 CLI가 직접 outbox 파일을 쓰지 않는다.

결과 저장 책임은 오케스트레이터가 가진다.

원칙:

- Claude CLI와 Codex CLI는 stdout으로만 응답한다.
- 오케스트레이터는 stdout을 캡처한다.
- 오케스트레이터는 캡처한 응답을 `.ai-workflow/outbox/<agent>/<task-id>-result.md`에 저장한다.
- 오케스트레이터는 저장한 결과 파일에 `Manual Handoff` 블록을 추가하거나 검증한다.

이 방식은 파일 쓰기 권한 승인 프롬프트를 줄이고, 결과 파일명과 위치를 안정적으로 통제하기 위함이다.

### 7.3 권한 승인 프롬프트

Claude CLI와 Codex CLI는 파일 쓰기, 셸 실행, 도구 사용 직전에 사용자 승인을 요구할 수 있다.

대화형 사용에서는 사용자가 직접 승인할 수 있지만, 비대화형 호출에서는 승인 프롬프트가 프로세스를 멈추게 할 수 있다.

PoC는 다음을 검증해야 한다.

- 권한 승인 프롬프트가 발생하는가
- 권한 승인 프롬프트 발생 시 stdout 또는 stderr에서 감지 가능한가
- 권한 승인 우회 옵션이 있는가
- 우회 옵션을 사용할 경우 격리된 PoC 폴더 안에서만 실행되는가
- 우회 옵션을 사용하지 않을 경우 timeout으로 안전하게 중단되는가

권한 우회 옵션 이름은 CLI 버전마다 달라질 수 있으므로 명세에 고정하지 않고 `dual-ai-poc verify` 단계에서 확인한다.

검증 결과는 `.ai-workflow/verification.md`에 기록한다.

### 7.4 반자동 라우팅 우선 원칙

PoC의 시나리오 4, 5에서 한쪽 결과를 다른쪽 입력으로 넘기는 방식은 처음부터 완전 자동화하지 않는다.

권장 순서:

1. 사용자가 outbox 결과 파일을 확인한다.
2. 결과 파일의 `Manual Handoff` 문구를 반대쪽 CLI에 붙여넣거나, 해당 결과를 기반으로 inbox 작업 파일을 만든다.
3. 이 반자동 방식이 성공하면 오케스트레이터가 outbox를 inbox로 변환하는 자동화를 추가 검증한다.

PoC 단계에서는 사용자가 개입하는 반자동 라우팅을 기본값으로 둔다.

자동 변환은 다음 조건이 충족된 뒤 검증한다.

- outbox 결과 파일이 통일된 Markdown 스키마를 따른다.
- `Target Agent`, `Task ID`, `Phase`, `Manual Handoff`가 파싱 가능하다.
- 변환 결과가 중복 실행을 일으키지 않는다.

### 7.5 재시도 정책

PoC의 기본 재시도 횟수는 0회이다.

timeout, 권한 프롬프트, 비정상 종료가 발생하면 자동 재시도하지 않고 즉시 failed 상태로 이동한다.

이유:

- 구독 플랜 사용량을 보호해야 한다.
- 실패 원인을 사람이 직접 확인하는 편이 안전하다.
- 잘못된 자동 재시도 루프를 막아야 한다.

## 8. 작업 파일 형식

각 작업은 Markdown 파일 하나로 표현한다.

예시:

```markdown
# PoC Task

## Task ID

poc-001

## Target Agent

claude

## Requested By

user

## Purpose

비대화형 CLI 호출 검증

## Instructions

다음 문장만 출력하고 종료하세요.

"Claude PoC OK"

## Expected Output

- 응답이 stdout으로 캡처되어야 한다.
- exit code가 0이어야 한다.
- 결과가 `.ai-workflow/outbox/claude/poc-001-result.md`에 저장되어야 한다.

## Manual Handoff

Next Agent: codex

Paste This:

"다음 파일을 읽고 Claude PoC 결과를 검수해줘: .ai-workflow/outbox/claude/poc-001-result.md"

Context File:

.ai-workflow/shared/context-ledger.md
```

Codex 검증용 예시:

```markdown
# PoC Task

## Task ID

poc-002

## Target Agent

codex

## Requested By

user

## Purpose

Codex CLI 비대화형 호출 검증

## Instructions

다음 문장만 출력하고 종료하세요.

"Codex PoC OK"

## Expected Output

- 응답이 stdout으로 캡처되어야 한다.
- exit code가 0이어야 한다.
- 결과가 `.ai-workflow/outbox/codex/poc-002-result.md`에 저장되어야 한다.

## Manual Handoff

Next Agent: claude

Paste This:

"다음 파일을 읽고 Codex PoC 결과에 따라 필요한 후속 작업을 수행해줘: .ai-workflow/outbox/codex/poc-002-result.md"

Context File:

.ai-workflow/shared/context-ledger.md
```

## 9. Context Ledger 형식

`context-ledger.md`는 PoC 진행 맥락을 잃지 않기 위한 서기관 역할의 Markdown 파일이다.

위치:

```text
.ai-workflow/shared/context-ledger.md
```

최소 기록 항목:

- PoC 시작 시각
- 실행 환경
- 현재 단계
- 마지막 성공 작업
- 마지막 실패 작업
- Claude 호출 결과 요약
- Codex 호출 결과 요약
- 다음 담당 에이전트
- 다음 에이전트에게 붙여넣을 수동 지시문
- 재개 시 읽어야 할 파일 목록

예시:

```markdown
# Context Ledger

## Current State

- Phase: codex_review
- Last Actor: claude
- Next Actor: codex
- Current Task: poc-001

## Narrative

Claude CLI 비대화형 호출 검증이 완료되었다. 결과 파일은 `.ai-workflow/outbox/claude/poc-001-result.md`이다. 다음 단계는 Codex가 이 결과를 검수하는 것이다.

## Manual Handoff

"다음 파일을 읽고 Claude PoC 결과를 검수해줘: .ai-workflow/outbox/claude/poc-001-result.md"

## Resume Files

- .ai-workflow/shared/status.md
- .ai-workflow/events.jsonl
- .ai-workflow/outbox/claude/poc-001-result.md
```

## 10. 이벤트 로그 형식

`.ai-workflow/events.jsonl`

한 줄에 JSON 객체 하나를 기록한다.

예시:

```json
{"time":"2026-05-09T15:00:00+09:00","type":"task_detected","task_id":"poc-001","agent":"claude","path":".ai-workflow/inbox/claude/poc-001.md"}
{"time":"2026-05-09T15:00:01+09:00","type":"agent_started","task_id":"poc-001","agent":"claude","command":"claude -p <task-file>"}
{"time":"2026-05-09T15:00:10+09:00","type":"agent_completed","task_id":"poc-001","agent":"claude","exit_code":0,"output_path":".ai-workflow/outbox/claude/poc-001-result.md"}
```

기록할 이벤트:

- 작업 파일 감지
- processing 폴더 이동
- 에이전트 호출 시작
- 에이전트 호출 완료
- 에이전트 호출 실패
- timeout
- 결과 파일 생성
- archive 이동
- failed 이동
- 호출 제한 도달
- context-ledger 갱신
- Manual Handoff 생성
- 권한 프롬프트 감지
- prerequisites check 결과
- payload mode 검증 결과

## 11. PoC 테스트 시나리오

### 시나리오 0: prerequisites check

목적:

PoC 시작 전에 실행 환경과 CLI 설치 상태를 확인한다.

검증 항목:

- PowerShell 7 설치 여부
- Node.js 설치 여부
- Git 설치 여부
- `claude --version` 실행 가능 여부
- `codex --version` 실행 가능 여부
- Claude CLI 로그인 상태 확인 가능 여부
- Codex CLI 로그인 상태 확인 가능 여부

성공 기준:

- 필수 도구가 설치되어 있다.
- Claude CLI와 Codex CLI 명령이 PATH에서 실행된다.
- 로그인 상태 확인 방법이 있거나, 확인 불가 상태가 verification.md에 기록된다.

### 시나리오 1: Claude 단일 호출

목적:

Claude CLI가 Markdown 지시사항을 받아 비대화형으로 응답할 수 있는지 확인한다.

절차:

1. `.ai-workflow/inbox/claude/poc-claude-001.md` 생성
2. 오케스트레이터가 파일 감지
3. debounce 및 파일 크기 안정성 확인
4. 작업 파일을 `.ai-workflow/processing/claude`로 이동
5. Claude CLI를 stdin 기본 방식으로 호출
6. stdout 캡처
7. 오케스트레이터가 결과 파일 저장
8. 이벤트 로그 기록

성공 기준:

- 결과 파일이 생성된다.
- 결과 파일에 `Claude PoC OK`가 포함된다.
- exit code가 기록된다.
- CLI가 직접 파일을 쓰지 않고 오케스트레이터가 stdout을 저장한다.

### 시나리오 2: Codex 단일 호출

목적:

Codex CLI가 Markdown 지시사항을 받아 비대화형으로 응답할 수 있는지 확인한다.

절차:

1. `.ai-workflow/inbox/codex/poc-codex-001.md` 생성
2. 오케스트레이터가 파일 감지
3. debounce 및 파일 크기 안정성 확인
4. 작업 파일을 `.ai-workflow/processing/codex`로 이동
5. Codex CLI를 stdin 기본 방식으로 호출
6. stdout 캡처
7. 오케스트레이터가 결과 파일 저장
8. 이벤트 로그 기록

성공 기준:

- 결과 파일이 생성된다.
- 결과 파일에 `Codex PoC OK`가 포함된다.
- exit code가 기록된다.
- CLI가 직접 파일을 쓰지 않고 오케스트레이터가 stdout을 저장한다.

### 시나리오 3: 파일 감시 트리거

목적:

새 Markdown 파일 생성이 정확히 한 번만 감지되는지 확인한다.

성공 기준:

- 같은 작업이 중복 실행되지 않는다.
- 생성 이벤트와 쓰기 완료 이벤트가 중복 실행으로 이어지지 않는다.
- 파일이 쓰이는 도중에는 읽지 않는다.
- processing 상태가 적용된다.
- 완료 후 archive 또는 outbox로 이동된다.

### 시나리오 4: Codex to Claude 연계

목적:

Codex가 Claude에게 줄 구현 지시를 생성하고, Claude가 그 지시를 수행할 수 있는지 확인한다.

PoC 기본 방식:

- 반자동 라우팅
- 사용자가 Codex outbox 결과를 확인
- 사용자가 `Manual Handoff` 문구를 Claude에 붙여넣거나 Claude inbox 작업 파일을 생성

성공 기준:

- Codex 결과가 Claude inbox 작업으로 변환된다.
- Claude가 해당 작업을 수행한다.
- Claude 결과가 outbox에 저장된다.
- 반자동 라우팅 방식이 먼저 성공한다.

### 시나리오 5: Claude to Codex 연계

목적:

Claude 작업 결과를 Codex가 검수할 수 있는지 확인한다.

PoC 기본 방식:

- 반자동 라우팅
- 사용자가 Claude outbox 결과를 확인
- 사용자가 `Manual Handoff` 문구를 Codex에 붙여넣거나 Codex inbox 작업 파일을 생성

성공 기준:

- Claude 결과 파일이 Codex inbox 작업으로 변환된다.
- Codex가 검수 결과를 생성한다.
- Codex 결과가 outbox에 저장된다.
- 반자동 라우팅 방식이 먼저 성공한다.

### 시나리오 6: timeout 처리

목적:

CLI가 응답하지 않을 때 오케스트레이터가 프로세스를 종료할 수 있는지 확인한다.

성공 기준:

- 설정된 timeout 이후 프로세스가 종료된다.
- 실패 이벤트가 기록된다.
- 작업 상태가 failed로 남는다.
- 자동 재시도하지 않는다.

### 시나리오 7: 호출 제한

목적:

구독 플랜 사용량 보호를 위해 호출 횟수 제한이 동작하는지 확인한다.

성공 기준:

- 최대 호출 수를 넘으면 추가 호출이 중단된다.
- 호출 제한 이벤트가 기록된다.
- 사용자 승인 또는 수동 재개가 필요하다.

### 시나리오 8: Manual Handoff 생성

목적:

자동화가 실패하더라도 사용자가 반대쪽 CLI에 단순히 복사/붙여넣기할 수 있는 지시문이 생성되는지 확인한다.

성공 기준:

- 결과 파일에 `Manual Handoff` 섹션이 포함된다.
- `Paste This` 항목이 큰따옴표로 감싸진 단일 지시문을 포함한다.
- 지시문 안에 반대쪽 에이전트가 읽어야 할 Markdown 경로가 포함된다.
- `Context File` 항목이 `.ai-workflow/shared/context-ledger.md`를 가리킨다.

### 시나리오 9: context-ledger 기록

목적:

처음부터 현재까지의 진행 내역이 서기관처럼 누적 기록되는지 확인한다.

성공 기준:

- `.ai-workflow/shared/context-ledger.md`가 생성된다.
- 현재 단계, 마지막 담당자, 다음 담당자, 마지막 작업 ID가 기록된다.
- 마지막 결과 파일 경로가 기록된다.
- 수동 전달 지시문이 기록된다.

### 시나리오 10: 재시작 후 맥락 복원

목적:

PowerShell 또는 오케스트레이터가 종료된 뒤에도 기록 파일을 읽고 작업을 이어갈 수 있는지 확인한다.

절차:

1. Claude 또는 Codex 단일 호출을 1회 성공시킨다.
2. 오케스트레이터를 종료한다.
3. 오케스트레이터를 다시 시작한다.
4. `dual-ai-poc status` 또는 `dual-ai-poc resume-context`를 실행한다.

성공 기준:

- `context-ledger.md`와 `events.jsonl`을 읽어 마지막 상태를 표시한다.
- 다음 담당 에이전트를 표시한다.
- 반대쪽 CLI에 붙여넣을 수동 지시문을 표시한다.
- 진행 중이던 작업 파일 또는 마지막 결과 파일 경로를 표시한다.

### 시나리오 11: 페이로드 전달 방식 검증

목적:

Markdown 파일 내용을 CLI에 안정적으로 전달할 수 있는 방식을 확정한다.

검증 방식:

- stdin 파이프
- 인자 문자열 전달
- 파일 경로 전달 가능 여부

성공 기준:

- 최소 한 가지 방식으로 멀티라인 Markdown이 깨지지 않고 전달된다.
- 기본 방식이 config.yml의 `payload_mode`에 기록된다.
- 실패한 방식과 이유가 verification.md에 기록된다.

### 시나리오 12: 권한 프롬프트 처리 검증

목적:

비대화형 호출 중 권한 승인 프롬프트가 자동화를 멈추는지 확인한다.

성공 기준:

- 권한 프롬프트 발생 여부가 기록된다.
- 권한 우회 옵션이 있는지 기록된다.
- 우회 옵션 사용 시 PoC 격리 폴더에서만 실행된다.
- 프롬프트로 멈추면 timeout 후 failed 처리된다.

## 12. PoC 명령어 초안

```bash
dual-ai-poc init
dual-ai-poc prerequisites
dual-ai-poc verify claude
dual-ai-poc verify codex
dual-ai-poc verify-payload claude
dual-ai-poc verify-payload codex
dual-ai-poc watch
dual-ai-poc status
dual-ai-poc run-task .ai-workflow/inbox/claude/poc-001.md
dual-ai-poc resume-context
dual-ai-poc cost-report
dual-ai-poc reset
```

### 명령어 설명

- `dual-ai-poc init`: PoC용 `.ai-workflow` 폴더 구조 생성
- `dual-ai-poc prerequisites`: PowerShell, Node.js, Git, Claude CLI, Codex CLI 설치 및 로그인 상태 점검
- `dual-ai-poc verify claude`: Claude CLI 단일 비대화형 호출 검증
- `dual-ai-poc verify codex`: Codex CLI 단일 비대화형 호출 검증
- `dual-ai-poc verify-payload claude`: Claude CLI 페이로드 전달 방식 검증
- `dual-ai-poc verify-payload codex`: Codex CLI 페이로드 전달 방식 검증
- `dual-ai-poc watch`: inbox 폴더 감시 시작
- `dual-ai-poc status`: 현재 이벤트, 호출 횟수, 처리 중 작업 표시
- `dual-ai-poc run-task <path>`: 특정 작업 파일을 즉시 실행
- `dual-ai-poc resume-context`: `context-ledger.md`와 `events.jsonl`을 읽고 재개 지점과 수동 전달 문구 표시
- `dual-ai-poc cost-report`: 누적 호출 횟수와 추정 사용량 표시
- `dual-ai-poc reset`: PoC 상태 초기화

## 13. 검증 결과 문서

PoC 실행 결과는 `.ai-workflow/verification.md`에 기록한다.

```markdown
# PoC Verification Result

## Environment

- OS:
- PowerShell version:
- Node.js version:
- Claude CLI version:
- Codex CLI version:
- Git version:

## Claude CLI

- Non-interactive execution:
- Payload mode:
- Stdin payload:
- Argument payload:
- File path payload:
- Stdout capture:
- Exit code:
- Timeout:
- Permission prompt:
- Permission prompt bypass:
- Working directory:
- Login/session issue:
- Notes:

## Codex CLI

- Non-interactive execution:
- Payload mode:
- Stdin payload:
- Argument payload:
- File path payload:
- Stdout capture:
- Exit code:
- Timeout:
- Permission prompt:
- Permission prompt bypass:
- Working directory:
- Login/session issue:
- Notes:

## File Watcher

- Detect create event:
- Debounce:
- File size stability check:
- Duplicate prevention:
- Processing move:
- Archive move:
- Failed move:
- Notes:

## Chained Workflow

- Codex to Claude:
- Claude to Codex:
- Notes:

## Limit Control

- Max total calls:
- Max Claude calls:
- Max Codex calls:
- Stop on limit:
- Notes:

## Manual Handoff

- Handoff block generated:
- Quoted paste instruction:
- Target Markdown path included:
- Context file included:
- Notes:

## Context Resume

- Context ledger generated:
- Context ledger updated:
- Resume after orchestrator restart:
- Last task restored:
- Next action restored:
- Notes:

## Final Judgment

- PoC status: success / partial / failed
- MVP recommendation:
- Required changes:
```

## 14. PoC 이후 판단

### PoC 성공 시

- `dual-ai` MVP 설계로 진행한다.
- Windows Terminal 3분할 UI를 추가한다.
- 프로젝트별 `phases.yml`을 설계한다.
- 사용자 승인 게이트를 강화한다.
- 이벤트 로그와 상태 대시보드를 제품 기능으로 확장한다.
- `context-ledger.md`와 수동 전달 문구를 MVP 필수 기능으로 포함한다.

### PoC 부분 성공 시

- 안정적인 CLI만 자동화한다.
- 불안정한 CLI는 수동 실행 또는 반자동 모드로 둔다.
- 오케스트레이터 구조를 수정한다.
- 실패한 항목을 별도 리스크로 관리한다.

### PoC 실패 시

- 완전 자동화 대신 수동 Markdown 워크플로우 도구로 축소한다.
- CLI 직접 호출 대신 사용자가 복사/붙여넣기하는 보조 도구로 전환한다.
- 좌우 분할 터미널은 모니터링 및 수동 작업 UI로만 사용한다.

## 15. 현재 결론

PoC는 제품의 축소판이 아니라 위험한 가정을 검증하는 실험이다.

가장 먼저 확인해야 할 것은 다음 네 가지이다.

```text
1. Claude CLI 비대화형 호출이 실제로 안정적인가
2. Codex CLI 비대화형 호출이 실제로 안정적인가
3. Markdown 파일 입력과 결과 파일 출력이 가능한가
4. 파일 감시로 한쪽 결과를 다른쪽 입력으로 넘길 수 있는가
5. 자동화 실패 시 수동 전달 문구로 작업을 이어갈 수 있는가
6. context-ledger.md를 통해 재시작 후 맥락을 복원할 수 있는가
7. stdin, 인자, 파일 경로 중 어떤 payload mode가 안정적인가
8. 권한 프롬프트가 PoC 자동화를 멈추는가
9. Windows 파일 감시 중복 이벤트를 debounce와 processing 이동으로 제어할 수 있는가
```

이 네 가지가 통과하면 MVP 구현으로 넘어갈 수 있다.
