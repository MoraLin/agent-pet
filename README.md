# claude-pet

會反應 Claude Code 對話狀態的桌面寵物(Electron app)。理念很簡單:**寵物長什麼樣子完全由 GIF 圖檔決定,不用寫程式**——去 [codex-pets.net](https://codex-pets.net/) 下載一組角色的 GIF 包,在寵物身上點右鍵選「匯入寵物外觀...」選到那個資料夾,就換成那個角色了(細節見下面「換一隻寵物」)。

閒置時會自動待機、走路、偶爾跳躍或衝刺跑一段、閒太久會趴下睡覺;對話進行中會切換成打字工作中、看代碼、需要協助、出錯等動畫。

**只對 Claude Code(CLI / VS Code 分機 / 終端機)有效。** 如果是用 Claude 桌面應用程式(claude.ai 的 app),沒有 hooks 機制可以反應,裝了也只會是隻自己亂晃、不理人的寵物。

## 換一隻寵物(不用寫程式)

寵物的長相全部來自一組 GIF 檔案,程式是用**檔名裡的關鍵字**去對應動作,不是寫死某個檔名——所以要換角色,只要:

1. 去 [codex-pets.net](https://codex-pets.net/) 挑一組角色的 GIF 包下載(或自己找/畫一組,只要檔名符合下面的關鍵字規則)。
2. 在寵物身上點右鍵,選「**匯入寵物外觀...**」,選到你剛下載、解壓縮後的那個資料夾就好——不用先解壓縮到特定位置、不用碰終端機。App 會自動檢查這個資料夾裡的 GIF 是否齊全,齊全就立刻套用、寵物馬上換上新外觀;缺了什麼會直接告訴你缺什麼,不會套用一半。

開發模式(直接跑原始碼、不是用「匯入」功能)想要換皮膚,可以直接把整包 GIF 丟進 `src/assets/skin/`(專案裡的這份是**出廠預設值**,只有第一次啟動、使用者自己的外觀資料夾是空的時候才會拿來用;之後不管是手動改這裡還是用「匯入」功能換過,兩者都是各自獨立的,不會互相同步)。實際執行時真正在讀的是 `app.getPath('userData')/skin/`(這台機器上是 `~/Library/Application Support/claude-pet/skin/`),換完之後重開 App(或用匯入功能,它會自動重新載入)就會生效。

檔名格式是 `<任意前綴>-<關鍵字>.gif`,前綴可以是任何字、也可以自己帶 `-`(例如 `skin-idle.gif`、`jimao-idle.gif`、`yier-bubu-idle.gif` 都可以),程式是從檔名**尾端**比對關鍵字,不是看前綴,而且是**完全比對**(不是模糊比對——`running` 跟 `running-left` 是兩個不同的檔案,不會互相搶到)。目前用到的關鍵字:

| 關鍵字 | 對應動作 |
|---|---|
| `idle` | 待機、打招呼、摸摸、Stop(完成一個回合) |
| `running-left` / `running-right` | 閒晃走路、隨機衝刺跑一段(依方向自動選圖) |
| `running` | 工作中(打字/思考/整理上下文等,原地不動的忙碌狀態) |
| `jumping` | 隨機跳一下 |
| `review` | 在看代碼(`Read`/`Grep`/`Glob` 工具呼叫) |
| `waiting` | 不耐煩(偵測到卡住了) |
| `waving` | 需要協助(權限詢問) |
| `failed` | 出錯(工具執行失敗) |
| `look-left-side` / `look-right-side`(**可省略**) | 閒置太久睡著(依方向自動選圖) |

除了 `look-left-side`/`look-right-side` 這一對(不是每組 GIF 包都會特別畫睡覺姿勢,沒有的話就顯示待機圖睡),**其他每個關鍵字都要有對應檔案**,缺一個程式啟動就會直接報錯(在 `preload.js` 的 `resolveGif()` 裡,故意設計成缺檔案就整個炸掉、不會悄悄顯示錯的圖或空白,方便馬上發現漏放了哪個檔案)。

## 分享給別人用(不需要對方裝 Node.js)

```bash
npm run dist
```

會在 `dist/mac-arm64/ClaudePet.app` 產生一個完整獨立的 macOS App(Apple Silicon,M 系列晶片)。把這個檔案(可以壓成 zip)給對方就好,**不用給整個專案資料夾**,對方也不需要裝 Node.js。

對方是 Intel Mac 的話改用:

```bash
npm run dist:x64
```

會產生在 `dist/mac/ClaudePet.app`(路徑不一樣,因為 electron-builder 沒指定 arch 時的預設輸出目錄名稱就是 `mac`)。兩個指令可以各自重跑、互不影響,`dist/` 底下會同時保留 `mac-arm64/` 跟 `mac/` 兩份。

- Hooks 設定(讓桌寵能反應 Claude Code)會在**每次啟動時自動檢查並加好**,不需要對方額外跑腳本或手動編輯設定檔——真的就是雙擊、結束。
- 這個 App **沒有簽章**(沒有 Apple 開發者憑證)。如果是透過網路傳的(帶有「隔離」標記),新版 macOS(Ventura/Sonoma/Sequoia)不會顯示「開發者不明」的提示,而是直接顯示「**已損毀,無法打開**」——右鍵點「開啟」沒用,檔案其實沒壞。對方要在終端機執行(路徑換成實際存放位置):`xattr -cr /path/to/ClaudePet.app`,清掉隔離標記後就能正常雙擊打開。本機建置直接執行不會遇到這個問題。
- 想要重新產生(例如改了程式碼),重跑對應的指令就好,舊的內容會被覆蓋。

## 開發用(自己改程式碼、跑起來測試)

```bash
git clone <this-repo>   # 或直接複製整個 claude-pet 資料夾
cd claude-pet
npm install              # 安裝 Electron
npm start                 # 啟動桌寵
```

啟動時一樣會自動檢查並設定好 Claude Code hooks(寫進 `~/.claude/settings.json`,不會動到裡面其他設定,原檔案會先備份成 `.bak`)。這個設定是**全域的**,所以裝一次之後,電腦上任何 Claude Code session 都會讓桌寵有反應——桌寵本身不知道事件是哪個對話送來的,只會反映「機器上最近一次的 Claude Code 動作」。

想確認實際加了什麼,或自己手動編輯,對應的 JSON 長這樣:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "http", "url": "http://localhost:9876/event", "timeout": 5 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "http", "url": "http://localhost:9876/event", "timeout": 5 }] }],
    "PreToolUse": [{ "matcher": ".*", "hooks": [{ "type": "http", "url": "http://localhost:9876/event", "timeout": 5 }] }],
    "PostToolUse": [{ "matcher": ".*", "hooks": [{ "type": "http", "url": "http://localhost:9876/event", "timeout": 5 }] }],
    "PostToolUseFailure": [{ "matcher": ".*", "hooks": [{ "type": "http", "url": "http://localhost:9876/event", "timeout": 5 }] }],
    "Stop": [{ "hooks": [{ "type": "http", "url": "http://localhost:9876/event", "timeout": 5 }] }],
    "Notification": [{ "hooks": [{ "type": "http", "url": "http://localhost:9876/event", "timeout": 5 }] }],
    "PreCompact": [{ "hooks": [{ "type": "http", "url": "http://localhost:9876/event", "timeout": 5 }] }],
    "PostCompact": [{ "hooks": [{ "type": "http", "url": "http://localhost:9876/event", "timeout": 5 }] }]
  }
}
```

## (可選)開機自動啟動、當掉自動重開

`npm start` 跑起來的桌寵,存活時間跟那個終端機視窗綁在一起,關掉終端機就會跟著消失。如果想要它完全獨立(登入電腦自動啟動、當掉自動救回來),macOS 可以設定 LaunchAgent:

1. 建立 `~/Library/LaunchAgents/com.<yourname>.claude-pet.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.<yourname>.claude-pet</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/claude-pet/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron</string>
        <string>.</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/claude-pet</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/path/to/claude-pet/logs/app.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/claude-pet/logs/app.log</string>
    <key>ProcessType</key>
    <string>Interactive</string>
</dict>
</plist>
```

`KeepAlive.SuccessfulExit: false` 的意思是:只有非正常結束(當掉)才會自動重開,自己按右鍵選單的「結束 Quit」不會被硬重啟。

2. 載入它:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.<yourname>.claude-pet.plist
```

3. 之後如果改了程式碼想套用,不要直接 `kill`(可能被當成正常結束而不會自動重開),要用:

```bash
launchctl kickstart -k gui/$(id -u)/com.<yourname>.claude-pet
```

常用指令:
- 查看狀態:`launchctl list | grep claude-pet`
- 暫時關閉自動啟動:`launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.<yourname>.claude-pet.plist`

Windows/Linux 想要類似效果,對應機制分別是工作排程器(Task Scheduler)、systemd user service,概念一樣但要自己設定。

## 疑難排解

寵物行為怪怪的、消失、卡住,先查 `logs/events.log`(只記真正的錯誤:當機、renderer 未接住的例外、Claude Code 回報的工具失敗、我們自己判斷「看起來卡住了」的計時器),不要急著加除錯程式碼。打包成 `.app` 執行的版本,這份記錄改放在系統的 App 資料夾裡(`~/Library/Application Support/claude-pet/logs/events.log`),不是專案資料夾裡。

外觀看起來不對(例如手動去改了 `~/Library/Application Support/claude-pet/skin/` 裡的檔案,刪掉了某個必要的關鍵字對應的 GIF),重開 App 會直接啟動失敗——這是刻意設計成這樣,而不是悄悄顯示錯的圖(見上面「換一隻寵物」)。用右鍵選單的「匯入寵物外觀...」重新匯入一組完整的 GIF 包就能修好,不需要手動清資料夾。

新增/修改動畫的規範跟踩過的坑,見 `ANIMATION_GUIDELINES.md`。
