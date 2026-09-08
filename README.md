# Agent Pet

會反應 Claude Code / Codex CLI 對話狀態的桌面寵物(Electron app)。理念很簡單:**寵物長什麼樣子完全由 GIF 圖檔決定,不用寫程式**——去 [codex-pets.net](https://codex-pets.net/) 下載一組角色的 GIF 包,在寵物身上點右鍵選「匯入寵物外觀...」選到那個資料夾,就換成那個角色了(細節見下面「換一隻寵物」)。

閒置時會自動待機、走路、偶爾跳躍或衝刺跑一段、閒太久會趴下睡覺;對話進行中會切換成打字工作中、看代碼、需要協助、出錯等動畫。

**支援 Claude Code(CLI / VS Code 分機 / 終端機)跟 Codex CLI 兩種 hooks 機制。** 兩邊都是啟動時自動偵測、自動加好設定,不用手動編輯任何設定檔。如果是用 Claude 桌面應用程式(claude.ai 的 app)或 ChatGPT 桌面應用程式,沒有對應的 hooks 機制可以反應,裝了也只會是隻自己亂晃、不理人的寵物。

## 換一隻寵物(不用寫程式)

寵物的長相全部來自一組 GIF 檔案,程式是用**檔名裡的關鍵字**去對應動作,不是寫死某個檔名——所以要換角色,只要:

1. 去 [codex-pets.net](https://codex-pets.net/) 挑一組角色的 GIF 包下載(或自己找/畫一組,只要檔名符合下面的關鍵字規則)。
2. 在寵物身上點右鍵,選「**匯入寵物外觀...**」,選到你剛下載、解壓縮後的那個資料夾就好——不用先解壓縮到特定位置、不用碰終端機。App 會自動檢查這個資料夾裡的 GIF 是否齊全,齊全就立刻套用、寵物馬上換上新外觀;缺了什麼會直接告訴你缺什麼,不會套用一半。

開發模式(直接跑原始碼、不是用「匯入」功能)想要換皮膚,可以直接把整包 GIF 丟進 `src/assets/skin/`(專案裡的這份是**出廠預設值**,只有第一次啟動、使用者自己的外觀資料夾是空的時候才會拿來用;之後不管是手動改這裡還是用「匯入」功能換過,兩者都是各自獨立的,不會互相同步)。實際執行時真正在讀的是 `app.getPath('userData')/skin/`(macOS 上是 `~/Library/Application Support/agent-pet/skin/`),換完之後重開 App(或用匯入功能,它會自動重新載入)就會生效。

檔名格式是 `<任意前綴>-<關鍵字>.gif`,前綴可以是任何字、也可以自己帶 `-`(例如 `skin-idle.gif`、`dinosaur-idle.gif` 都可以),程式是從檔名**尾端**比對關鍵字,不是看前綴,而且是**完全比對**(不是模糊比對——`running` 跟 `running-left` 是兩個不同的檔案,不會互相搶到)。目前用到的關鍵字:

| 關鍵字 | 對應動作 |
|---|---|
| `idle` | 待機、打招呼、摸摸 |
| `running-left` / `running-right` | 閒晃走路、隨機衝刺跑一段(依方向自動選圖) |
| `running` | 工作中(打字/思考/整理上下文等,原地不動的忙碌狀態) |
| `jumping` | 隨機跳一下 |
| `review` | 在看代碼(`Read`/`Grep`/`Glob` 工具呼叫) |
| `waiting` | 不耐煩(偵測到卡住了) |
| `waving` | 需要協助(權限詢問) |
| `failed` | 出錯(工具執行失敗) |
| `look-left-side` / `look-right-side`(**可省略**) | 閒置太久睡著(依方向自動選圖) |
| `success`(**可省略**) | Stop(完成一個回合)——沒有這張圖就顯示待機圖 |
| `eating`(**可省略**) | 閒置時偶爾自己吃東西——沒有這張圖就不會觸發這個小動作 |
| `playing`(**可省略**) | 閒置時偶爾自己玩——沒有這張圖就不會觸發這個小動作 |

除了 `look-left-side`/`look-right-side`/`success`/`eating`/`playing` 這幾個可省略的(不是每組 GIF 包都會特別畫睡覺、慶祝或吃東西/玩耍的姿勢,沒有的話就顯示待機圖、或乾脆不觸發這個小動作),**其他每個關鍵字都要有對應檔案**,缺一個程式啟動就會直接報錯(在 `preload.js` 的 `resolveGif()` 裡,故意設計成缺檔案就整個炸掉、不會悄悄顯示錯的圖或空白,方便馬上發現漏放了哪個檔案)。

## 開發環境設定

需要 [pnpm](https://pnpm.io/)(這個專案用 pnpm 管理套件,不是 npm——`package.json` 有 pin `packageManager`,也只有 `pnpm-lock.yaml`,沒有 `package-lock.json`)。

```bash
git clone <this-repo>
cd AgentPet
pnpm install   # 安裝 Electron 等相依套件
pnpm start     # 啟動桌寵(dev 模式)
```

啟動時會自動偵測並設定好 hooks:
- **Claude Code**:寫進 `~/.claude/settings.json`(全域設定,不會動到裡面其他設定,原檔案會先備份成 `.bak`)。裝一次之後,電腦上任何 Claude Code session 都會讓桌寵有反應——桌寵本身不知道事件是哪個對話送來的,只會反映「機器上最近一次的動作」。用的是 `http` 型別的 hook,直接 POST 到桌寵自己開的本機事件接收服務(`http://127.0.0.1:9876/event`,只綁 `127.0.0.1`,不會對外開放)。
- **Codex CLI**:寫進 `~/.codex/hooks.json`。Codex 的 hook 只能是「執行一個指令」(不能是 http),所以這邊是透過 `codex-hook-forward.js` 這個小轉發腳本,把 Codex 丟進 stdin 的 JSON 轉貼到同一個本機事件接收服務。**Codex 每次偵測到 hook 指令內容變動,都會要求你在 Codex 裡執行 `/hooks` 重新審核信任**——這是 Codex 自己的安全機制,不是 bug,Agent Pet 偵測到這個情況時也會跳出提示視窗告訴你該怎麼做。

想確認實際加了什麼、或自己手動編輯,可以直接打開上面那兩個檔案看。

## 打包成獨立安裝檔(給不裝 Node.js 的人用)

```bash
pnpm run dist        # macOS, Apple Silicon (arm64) → dist/Agent-Pet-arm64.dmg
pnpm run dist:x64    # macOS, Intel (x64)          → dist/Agent-Pet-x64.dmg
pnpm run dist:win    # Windows x64 (portable .exe) → dist/Agent-Pet-win.exe
```

三個指令互不影響,可以各自重跑,`dist/` 底下會同時保留所有平台的產物。給對方的話直接給這一個檔案就好,**不用給整個專案資料夾**,對方也不需要裝 Node.js。跟開發模式一樣,hooks 設定會在**每次啟動時自動檢查並加好**,不需要對方額外跑腳本或手動編輯設定檔。

**這幾個建置目前都沒有數位簽章**(沒有 Apple 開發者憑證、也沒有 Windows 程式碼簽署憑證),對方打開時可能會遇到系統警告,是預期中的行為,不代表檔案壞掉或有問題:

- **macOS**:如果是透過網路傳的(帶有「隔離」標記),新版 macOS(Ventura/Sonoma/Sequoia)不會顯示「開發者不明」的提示,而是直接顯示「**已損毀,無法打開**」——右鍵點「開啟」沒用,檔案其實沒壞。對方要在終端機執行(路徑換成實際存放位置):`xattr -cr /path/to/Agent\ Pet.app`,清掉隔離標記後就能正常雙擊打開。本機建置直接執行不會遇到這個問題。
- **Windows**:一般會被 SmartScreen 擋下「Windows 已保護您的電腦」,點「其他資訊」→「仍要執行」就能繼續。如果對方的電腦開了「智慧型應用程式控制(Smart App Control)」,未簽章的程式會被**直接封鎖、沒有「仍要執行」的選項**,目前沒有繞過的方法,只能請對方關閉這項設定(微軟會提示這是單向操作,關閉後要重灌 Windows 才能再打開,是否要關閉由對方自行判斷)或改用有簽章的版本。

想要重新產生(例如改了程式碼),重跑對應的指令就好,舊的內容會被覆蓋。

## 驗證

```bash
pnpm run lint   # 語法檢查(目前用 node --check,還沒有真正的 ESLint/測試套件)
pnpm test       # 目前跟 lint 是同一支腳本
```

## (可選)開機自動啟動、當掉自動重開

`pnpm start` 跑起來的桌寵,存活時間跟那個終端機視窗綁在一起,關掉終端機就會跟著消失。如果想要它完全獨立(登入電腦自動啟動、當掉自動救回來),macOS 可以設定 LaunchAgent:

1. 建立 `~/Library/LaunchAgents/com.<yourname>.agent-pet.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.<yourname>.agent-pet</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/AgentPet/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron</string>
        <string>.</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/AgentPet</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/path/to/AgentPet/logs/app.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/AgentPet/logs/app.log</string>
    <key>ProcessType</key>
    <string>Interactive</string>
</dict>
</plist>
```

`KeepAlive.SuccessfulExit: false` 的意思是:只有非正常結束(當掉)才會自動重開,自己按右鍵選單的「結束 Quit」不會被硬重啟。

2. 載入它:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.<yourname>.agent-pet.plist
```

3. 之後如果改了程式碼想套用,不要直接 `kill`(可能被當成正常結束而不會自動重開),要用:

```bash
launchctl kickstart -k gui/$(id -u)/com.<yourname>.agent-pet
```

常用指令:
- 查看狀態:`launchctl list | grep agent-pet`
- 暫時關閉自動啟動:`launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.<yourname>.agent-pet.plist`

Windows/Linux 想要類似效果,對應機制分別是工作排程器(Task Scheduler)、systemd user service,概念一樣但要自己設定。

## 疑難排解

寵物行為怪怪的、消失、卡住,先查 `logs/events.log`(只記真正的錯誤:當機、renderer 未接住的例外、hook 回報的工具失敗、我們自己判斷「看起來卡住了」的計時器),不要急著加除錯程式碼。打包成 `.app`/`.exe` 執行的版本,這份記錄改放在系統的 App 資料夾裡(macOS:`~/Library/Application Support/agent-pet/logs/events.log`),不是專案資料夾裡。

外觀看起來不對(例如手動去改了使用者外觀資料夾裡的檔案,刪掉了某個必要的關鍵字對應的 GIF),重開 App 會直接啟動失敗——這是刻意設計成這樣,而不是悄悄顯示錯的圖(見上面「換一隻寵物」)。用右鍵選單的「匯入寵物外觀...」重新匯入一組完整的 GIF 包就能修好,不需要手動清資料夾。

Codex hook 設定好之後寵物還是沒反應,先確認 Codex 裡有沒有跳出「hooks need review」的畫面,執行 `/hooks` 按 `t` 信任——這是 Codex 自己的安全機制,不是 Agent Pet 的 bug,詳見上面「開發環境設定」。

## 授權(License)

原始碼採用 MIT License,詳見 [`LICENSE`](./LICENSE)。**寵物 GIF 素材跟部分圖示不在 MIT 授權範圍內**,詳見 [`ASSETS-LICENSE.md`](./docs/ASSETS-LICENSE.md)。

安全性問題回報請見 [`SECURITY.md`](./docs/SECURITY.md);想貢獻程式碼請見 [`CONTRIBUTING.md`](./docs/CONTRIBUTING.md)。

新增/修改動畫的規範跟踩過的坑,見 `docs/ANIMATION_GUIDELINES.md`。
