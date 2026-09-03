# Agent Pet v1.2.0

## What's New

### Stability fixes
- Fixed several bugs where the pet could get stuck in the wrong state — e.g. stuck "waiting for help", or stuck "working" forever after you pressed Esc to interrupt — especially with multiple Claude Code/Codex sessions open at once.
- Fixed Codex hook settings endlessly duplicating after the app was renamed.
- Skin import and hook settings are now crash-safe — an interruption mid-save can no longer lose or corrupt your data.
- The app now shows a clear error and quits if it can't start receiving hook events, instead of running silently while unable to react to anything.
- Tuned the "waiting for help" / idle timing so the pet won't fall asleep while it's still waiting on you, and won't mistake long-running commands (like packaging builds) for something needing help.

### New features
- Added a desktop badge that checks once a day for a new version, with a link to download it.
- Added Codex CLI hook support, alongside the existing Claude Code support.
- Windows: proper installer packaging, plus a fix so relaunching the app no longer stacks duplicate pet windows.
- Added two optional idle animations (eating, playing) and a dedicated "task complete" animation — these show up automatically if your skin pack includes the matching image files.

### Behavior changes
- Renamed the app from ClaudePet to **Agent Pet**.

---

## 中文

### 穩定性修復
- 修復多個情況下寵物會卡在錯誤狀態的問題——例如卡在「等待協助」，或是按 Esc 中斷後永遠卡在「工作中」——尤其是同時開多個 Claude Code/Codex session 時更容易發生。
- 修復改名後 Codex hook 設定不斷重複疊加的問題。
- Skin 匯入與 hook 設定的儲存方式改良，過程中被中斷也不會遺失或弄壞你的資料。
- 事件接收服務如果無法啟動，現在會清楚提示並結束程式，不會安靜地完全沒反應。
- 調整「等待協助」與閒置的時間判斷，寵物不會在還在等你時就跑去睡覺，也不會把打包這類正常的長時間指令誤判成需要協助。

### 新功能
- 新增桌面更新提醒角標，每天檢查一次新版本，並附下載連結。
- 新增 Codex CLI 支援，與原本的 Claude Code 並存。
- Windows：正式提供安裝包，並修復重新啟動可能疊出多個寵物視窗的問題。
- 新增兩個可自訂的閒置動畫（吃東西、玩耍）與完成任務動畫——只要你的 skin 包裡有對應圖檔就會自動顯示。

### 行為調整
- 應用程式從 ClaudePet 全面改名為 **Agent Pet**。
