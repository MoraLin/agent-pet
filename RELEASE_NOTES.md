# Agent Pet v1.3.0

## What's New

### Stability fixes
- Fixed Codex hooks silently never firing on machines with no separate Node.js install on PATH (Codex's own bundled Node isn't exposed there) — the hook now runs using Agent Pet's own bundled runtime instead.
- Fixed that same fallback failing with a permission error on some locked-down Windows machines, and made it point at a stable install path instead of a temporary one.
- Codex requires re-approving a hook whenever its command changes - Agent Pet now shows a clear popup telling you to do that, instead of the pet just silently going quiet.

---

## 中文

### 穩定性修復
- 修復在系統 PATH 找不到獨立 Node.js 安裝的電腦上（Codex 自帶的 Node 並不會加進 PATH），Codex hook 完全不會觸發的問題——現在改用 Agent Pet 自帶的執行環境來執行。
- 修復同一個備援機制在部分管控較嚴的 Windows 電腦上會出現權限錯誤的問題，並改為指向穩定的安裝路徑，而不是暫存路徑。
- 每次 hook 指令內容變動，Codex 都需要重新審核信任——現在 Agent Pet 會跳出清楚的提示告訴你該怎麼做，而不是讓寵物默默不再有反應。
