# Agent Pet v1.5.0

## What's New

### Stability fixes
- Quitting the pet now removes the Claude Code / Codex hooks it registered on startup. Previously they were left behind pointing at a port nothing was listening on, so every hook call (e.g. `PreToolUse:Bash`) would fail with a connection error until the pet was reopened.

---

## 中文

### 穩定性修復
- 關閉寵物時，現在會一併移除它啟動時註冊給 Claude Code / Codex 的 hook。先前這些 hook 會留在設定檔裡，繼續指向一個沒有任何東西在監聽的 port，導致每次觸發 hook（例如 `PreToolUse:Bash`）都會跳出連線失敗的錯誤，直到重新打開寵物為止。
