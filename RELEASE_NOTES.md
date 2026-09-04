# Agent Pet v1.3.0

## What's New

### Stability fixes
- Fixed Codex hooks silently never firing on machines with no separate Node.js install on PATH (Codex's own bundled Node isn't exposed there) — the hook now runs using Agent Pet's own bundled runtime instead.

---

## 中文

### 穩定性修復
- 修復在系統 PATH 找不到獨立 Node.js 安裝的電腦上（Codex 自帶的 Node 並不會加進 PATH），Codex hook 完全不會觸發的問題——現在改用 Agent Pet 自帶的執行環境來執行。
