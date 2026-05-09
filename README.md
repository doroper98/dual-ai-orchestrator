# Dual AI Orchestrator PoC

Claude/Codex 실제 호출을 붙이기 전, PoC 저장소 구조와 실행 전제 조건을 확인하는 초기 CLI입니다.

## 현재 구현 범위

- `.ai-workflow` 기본 폴더와 템플릿 파일 생성
- PowerShell, Node.js, Git, Claude CLI, Codex CLI 설치 여부 확인
- Claude/Codex 로그인 확인이나 실제 AI 작업 호출은 아직 구현하지 않음

## 초보자용 로컬 테스트 순서

> 아래 명령은 `package.json`이 보이는 프로젝트 루트 폴더에서 실행해야 합니다.

1. 저장소를 받은 폴더로 이동합니다.

   ```powershell
   cd "C:\01_Antigravity\dual-ai-orchestrator"
   ```

2. 현재 폴더에 프로젝트 파일이 있는지 확인합니다.

   ```powershell
   dir
   ```

   최소한 아래 항목이 보여야 합니다.

   ```text
   package.json
   bin
   src
   test
   .ai-workflow
   ```

3. 단위 테스트를 실행합니다.

   ```powershell
   npm test
   ```

4. 문법 체크를 실행합니다.

   ```powershell
   npm run check
   ```

5. CLI 도움말을 확인합니다.

   ```powershell
   node bin/dual-ai-poc.js --help
   ```

6. `.ai-workflow` 구조 생성을 확인합니다.

   ```powershell
   node bin/dual-ai-poc.js init
   ```

7. prerequisites 검사를 실행합니다.

   ```powershell
   node bin/dual-ai-poc.js prerequisites
   ```

   Claude CLI나 Codex CLI가 아직 설치되어 있지 않다면 이 명령은 실패할 수 있습니다. 이 경우는 코드 오류가 아니라 로컬 환경에 필요한 도구가 없다는 뜻입니다.

## `dir` 결과에 문서만 보이는 경우

만약 아래처럼 명세 문서만 보인다면 아직 실행 가능한 코드가 내려받아지지 않은 상태입니다.

```text
dual-ai-cli-workflow-poc-spec.md
dual-ai-cli-workflow-spec-v2.md
```

이 경우에는 GitHub 저장소에 코드가 푸시되었는지 확인한 뒤 다시 받아야 합니다. 코드가 제대로 있으면 `package.json`, `bin`, `src`, `test`가 함께 보여야 합니다.

## 사용 가능한 CLI 명령

```bash
node bin/dual-ai-poc.js --help
node bin/dual-ai-poc.js init
node bin/dual-ai-poc.js prerequisites
```
