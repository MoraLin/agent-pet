# Agent Pet v1.2.0

## What's New

### Stability fixes
- Fixed several session-state bugs that could clobber or collide with another concurrent session's "waiting for help" state — including hook events missing a valid session ID.
- Fixed Codex hook settings endlessly duplicating.
- Fixed Codex hooks silently never firing on machines with no separate Node.js install on PATH (Codex's own bundled Node isn't exposed there) — the hook now runs using Agent Pet's own bundled runtime instead.
- Skin import and hook settings are now crash-safe — an interruption mid-save can no longer lose or corrupt your data.
- The app now shows a clear error and quits if it can't start receiving hook events, instead of running silently while unable to react to anything, and safely rejects malformed/oversized requests.
- Tuned the "waiting for help" / idle timing so the pet won't fall asleep while it's still waiting on you, and won't mistake long-running commands (like packaging builds) for something needing help.

### New features
- Added a desktop badge that checks once a day for a new version, with a link to download it.

---

## 中文

### 穩定性修復
- 修復多個 session 狀態的問題，避免不同 session 互相覆蓋或碰撞彼此的「等待協助」狀態——包含 hook 事件缺少有效 session ID 的情況。
- 修復 Codex hook 設定不斷重複疊加的問題。
- 修復在系統 PATH 找不到獨立 Node.js 安裝的電腦上（Codex 自帶的 Node 並不會加進 PATH），Codex hook 完全不會觸發的問題——現在改用 Agent Pet 自帶的執行環境來執行。
- Skin 匯入與 hook 設定的儲存方式改良，過程中被中斷也不會遺失或弄壞你的資料。
- 事件接收服務如果無法啟動，現在會清楚提示並結束程式，不會安靜地完全沒反應，也會安全地擋掉異常或過大的請求。
- 調整「等待協助」與閒置的時間判斷，寵物不會在還在等你時就跑去睡覺，也不會把打包這類正常的長時間指令誤判成需要協助。

### 新功能
- 新增桌面更新提醒角標，每天檢查一次新版本，並附下載連結。
