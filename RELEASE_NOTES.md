# Agent Pet v1.2.0

## What's New

### Stability fixes
- Fixed several session/alert state-machine race conditions where concurrent Claude Code sessions could clobber each other's "waiting for help" state.
- Fixed Codex hook config entries silently duplicating in `~/.codex/hooks.json` after the app was renamed.
- Skin import now copies into a staged temp directory and swaps in atomically, removing a data-loss window if the app crashed mid-import.
- Hook events missing a valid `session_id` are now detected and logged instead of silently colliding with other sessions.
- Claude/Codex hook config files are now written atomically (temp file + rename) instead of in place, removing a corruption window on crash/power-loss mid-write.
- The hook HTTP server now shows an error dialog and exits if it fails to bind its port, instead of running silently with no way to receive events.
- The hook HTTP server now rejects oversized request bodies (64KB cap) instead of buffering an unbounded payload in memory.
- Fixed an idle-animation timer bug and tuned the "waiting for help" / ESC-idle thresholds so the pet no longer goes idle while still waiting on the user.

### New features
- Added a desktop update-available notification badge that checks once a day and links to the latest release.
- Added Codex CLI hook support alongside the existing Claude Code hook integration.
- Added support for running multiple pets with different skins on Windows.

### Behavior changes
- Renamed the app from ClaudePet to **Agent Pet** (app name, package name, and bundle identifier).
- `main.js` was refactored into focused modules under `src/main/` for maintainability; no behavior changes.

---

## 中文

### 穩定性修復
- 修復多個 session 同時進行時，「等待協助」狀態機的競爭條件問題，避免不同 session 互相覆蓋彼此的狀態。
- 修復改名後 Codex hook 設定在 `~/.codex/hooks.json` 中不斷重複疊加的問題。
- 匯入 skin 時改為先複製到暫存目錄再原子性替換，避免匯入過程中當機造成資料遺失。
- 偵測並記錄缺少有效 `session_id` 的 hook 事件，避免不同 session 狀態互相碰撞。
- Claude/Codex 的 hook 設定檔改為原子寫入（暫存檔 + rename），避免寫入中途當機或斷電造成設定檔損毀。
- Hook 事件接收伺服器若無法啟動（例如 port 被占用），現在會跳出錯誤視窗並結束程式，不會再無聲無息地「看起來活著、實際上收不到事件」。
- Hook 事件接收伺服器現在會拒絕過大的請求內容（上限 64KB），避免無限制的資料量占用記憶體。
- 修復閒置動畫計時器問題，並調整「等待協助」與 ESC 閒置的時間門檻，避免寵物在仍在等待使用者時就跑去閒置。

### 新功能
- 新增桌面更新提醒角標，每天檢查一次是否有新版本，並可連結到最新版下載頁。
- 新增 Codex CLI 的 hook 支援，與既有的 Claude Code hook 整合並存。
- 新增 Windows 上可同時執行多隻不同 skin 寵物的支援。

### 行為調整
- 應用程式從 ClaudePet 全面改名為 **Agent Pet**（含 app 名稱、package 名稱與 bundle identifier）。
- `main.js` 重構拆分為 `src/main/` 底下多個模組，純粹為維護性改善，行為不變。
