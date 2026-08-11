# 桌寵動畫開發規範

這份文件記錄目前踩過的坑與對應規則,新增/修改動畫前先看一遍。

專案結構:`main.js`/`preload.js`/`index.html`/`style.css` 在專案根目錄;共用的 `src/renderer.js`、動畫行為程式碼 `src/anims/`、圖片素材 `src/assets/` 都收在 `src/` 資料夾裡,讓根目錄保持乾淨。

## 0. 先查永久事件記錄,不要每次都現場加 debug log

`claude-pet/logs/events.log`(開發模式下在專案資料夾裡面,不用切去別的地方找;打包成 `.app` 執行的版本因為 `__dirname` 指向唯讀的 `app.asar` 內部沒辦法寫,改放在 `app.getPath('userData')` 底下,這台機器上是 `~/Library/Application Support/claude-pet/logs/events.log`——`LOG_PATH` 用 `app.isPackaged` 判斷該用哪個路徑)——每一行一筆 JSON。**只記真的有問題的事件,不記日常運作**(閒置動畫切換、每個 hook 事件都不記——單純待機/走路切換就每幾秒一次,記下去一天內就會把 2MB 上限用完,失去長期參考價值):

- `source: 'app'`:App 啟動(含 pid)、`render-process-gone`(renderer 當掉)、`malformed_hook_payload`(收到的 hook payload 解析失敗)。
- `source: 'hook'`:只記 `PostToolUseFailure`(Claude Code 自己回報的工具執行失敗),其他 hook 事件不記。
- `source: 'heuristic'`:我們自己合成的「看起來卡住了」計時器觸發(`ImpatientTimeout`、`BashPendingTimeout`)。
- `source: 'renderer'`:renderer 端真的沒接住的例外(`uncaught_error`、`unhandled_rejection`),不記一般動畫切換。

檔案超過 2MB 會自動轉存成 `.old`(只留一份備份)。**遇到「寵物怪怪的/消失了/卡住了」這類問題,先看這份 log 對照時間點,不要又去加暫時的 debug code。** 如果要新增其他「真的算錯誤」的事件,呼叫 `main.js` 的 `logEvent({...})`(main process 側)或 `window.petAPI.logError({...})`(renderer 側,會透過 IPC 轉給 main 寫入同一份檔案)——**只加真正異常的情況,不要加回日常運作的記錄**,不然又會變成噪音蓋過重點、檔案很快轉存掉。

同資料夾裡的 `claude-pet/logs/app.log` 是 LaunchAgent 導過來的原始 stdout/stderr(例如 Electron 自己的警告訊息、`console.error`),跟結構化的 `events.log` 是兩份不同的檔案。

## 1. 動畫素材是 GIF,用檔名關鍵字比對,不是寫死路徑

早期版本(還在 git 歷史/舊 commit 裡能找到)是每個動作一組 PNG 逐格圖(`src/assets/<name>/1.png ~ 6.png`),用 `setInterval` 手動切換 `<img src>` 播放。**這套 PNG 逐格系統已經整個拆除**——現在每個動作都是一個會自己循環播放的 GIF,不需要任何手動切幀的程式碼。

- **`src/assets/nimbus/` 只是出廠預設值,不是實際在讀的地方**:App 實際讀取(跟「匯入寵物外觀」寫入)的是 `app.getPath('userData')/nimbus/`(`main.js` 算出來存在 `NIMBUS_LIVE_DIR`,這台機器上是 `~/Library/Application Support/claude-pet/nimbus/`),因為打包後 `src/assets/nimbus/`(`NIMBUS_DEFAULT_DIR`)在唯讀的 `app.asar` 裡面,使用者匯入新外觀時沒地方寫。`seedNimbusDirIfNeeded()` 只在這個使用者資料夾**不存在或是空的**時(通常就是第一次啟動)把 `NIMBUS_DEFAULT_DIR` 的內容複製過去當起始值,之後就不會再自動同步——換句話說,改動專案裡 `src/assets/nimbus/` 的檔案,**不會**反映到已經跑過一次的使用者身上,只有全新安裝或使用者資料夾被清掉才會重新吃到新的預設值。
  - `preload.js` 沒辦法直接呼叫 `app.getPath()`(那是 main process 專屬的 API),所以 `main.js` 算好 `NIMBUS_LIVE_DIR` 後,在建立視窗前用 `process.env.PET_NIMBUS_DIR = NIMBUS_LIVE_DIR` 傳過去,`preload.js` 讀這個環境變數(因為 `sandbox: false`,preload 有一份會反映這個 process 的 `process.env`)。
- **從檔名「尾端」比對關鍵字,不是切掉第一個 `-` 之前的東西**:`nimbus-keywords.js`(專案根目錄,`main.js`/`preload.js` 都會 `require`,只有一份定義,避免兩邊各自維護一套一樣的邏輯)的 `matchesKeyword(filename, keyword)` 判斷檔名去掉副檔名後**以 `-<keyword>` 結尾**(或整個檔名就等於 `keyword`,沒有前綴的極端情況)。一開始寫成「切掉第一個 `-` 之前的前綴」,後來發現角色名稱前綴自己也可能帶 `-`(例如 `yier-bubu-failed.gif`——前綴是 `yier-bubu`,不是 `yier`),切第一個 `-` 會把 `bubu-failed` 當成關鍵字去比對,永遠對不上——GIF 包作者要怎麼命名前綴我們無法控制,只有「關鍵字本身在檔名尾端」這件事是可以依賴的,所以改成從尾端比對。
  - 比對時關鍵字前面一定要有一個 `-` 做邊界,不能只看「結尾字母一樣」——`running` 跟 `running-left`/`running-right` 是三個並存、意義不同的檔案(一個是原地忙碌用的沒有方向性的圖,兩個是有方向的閒晃/衝刺圖),`xxx-running-left.gif` 結尾的字母也含有 `running`(在 `-left` 前面那段),但它結尾其實是 `-left`,不是 `-running`,所以不會被關鍵字 `running` 誤配到。
- **`preload.js` 的 `resolveGif(keyword, required = true)`**:`fs.readdirSync(NIMBUS_DIR)` 找符合 `matchesKeyword` 的檔案,回傳的是**絕對路徑**(`path.join(NIMBUS_DIR, match)`),不是相對於 `index.html` 的字串——因為 `NIMBUS_DIR` 現在在 App 本體資料夾外面(`userData`),相對路徑已經到不了那裡。找不到對應關鍵字的檔案,預設會直接 `throw`,讓 App 啟動失敗——這是刻意的,換了一組不完整的 GIF 包要馬上發現,而不是看到某個動作變成空白或卡在上一張圖才後知後覺。目前用到的完整關鍵字清單(`REQUIRED`/`OPTIONAL`)見 `nimbus-keywords.js` 跟 `README.md`。
  - 少數關鍵字是**可以省略**的(目前只有 `look-left-side`/`look-right-side`,不是每組 GIF 包都會特別畫睡覺姿勢),呼叫時傳 `resolveGif('look-left-side', false)`,找不到就回傳 `null` 而不是 throw,呼叫端自己接 `|| <fallback source>` 補上替代圖——新增這種「可省略」的關鍵字要放進 `nimbus-keywords.js` 的 `OPTIONAL`(不是 `REQUIRED`),並在 `README.md` 的關鍵字表裡標註清楚,不然使用者會誤以為漏放了必要檔案。
- **為什麼要 `sandbox: false`**:`fs`/`path` 只能在 `preload.js` 裡用,因為 `main.js` 的 `webPreferences` 把它的 `sandbox` 設成 `false`(渲染器本身仍然是 `contextIsolation: true` + `nodeIntegration: false`,沒有放寬)。`resolveGif` 透過 `contextBridge.exposeInMainWorld('petAPI', { resolveGif, ... })` 曝露給 renderer,`src/renderer.js`/`src/anims/*.js` 呼叫的是自己包一層的 `resolveGif(keyword)`(沒有 `window.petAPI` 時 fallback 回寫死的 `src/assets/nimbus/nimbus-<keyword>.gif`,方便直接拿瀏覽器開 `index.html` 快速預覽,不透過 Electron——這條路徑走的是專案裡的出廠預設值,不是 `userData`,純粹是開發時的權宜捷徑)。
- **「匯入寵物外觀...」右鍵選單(`main.js` 的 `importNimbusSkin()`)**:跳原生的 `dialog.showOpenDialog` 選資料夾 → 用 `nimbus-keywords.js` 的 `REQUIRED` 清單逐一檢查該資料夾的 `.gif` 檔案 → 缺任何一個就 `dialog.showMessageBoxSync` 顯示錯誤、不套用 → 都齊了就清空 `NIMBUS_LIVE_DIR` 再把新資料夾的 `.gif` 複製進去(**整批替換,不是合併**,避免舊皮膚留下的檔案跟新皮膚的關鍵字比對互相干擾)、最後 `win.reload()` 讓畫面立刻套用新外觀。
  - `win.reload()` 會重新觸發 `'did-finish-load'`,所以 `createWindow()` 裡送 `pet-init`(校正過選單列偏移量的正確 `viewW`/`viewH`)的那個監聽器**不能用 `.once()`**,要用 `.on()`,不然重新載入後量到的會是沒校正過的 `window.innerWidth`/`innerHeight`,寵物閒晃範圍會算錯。這個修正順帶也讓 renderer crash 後的自動重載(`render-process-gone` 那段)一樣拿得到正確尺寸,以前那個情境其實也漏了這個修正。
- **換角色皮膚不用改任何程式碼**:使用者用右鍵選單匯入即可(見 `README.md`);開發模式想手動換,直接把新的一組 GIF 丟進 `src/assets/nimbus/`,只影響*下一次全新啟動*(空白使用者資料夾)的預設值,不會覆蓋已經在跑的 `userData` 版本。

## 2. 「無聊睡覺」計時器要跟自動閒置動畫脫鉤

`BOREDOM_MS`(閒置多久後睡著,目前 90 秒)是用來偵測「多久沒有真正的外部互動」,不是「多久沒放動畫」。

- **不能**讓 jump / run 這類角色自己隨機觸發的閒置動畫去重置這個計時器(舊版還有 eat / ball / yawn,已經整個刪掉了,現在只剩 jump/run 是這種「自己隨機觸發」的動畫,見第 6 條)。這幾個動畫平均每 5~20 秒左右就會觸發一次,如果每次觸發都把倒數砍掉重練,90 秒幾乎永遠達不到(這就是先前踩到的 bug)。
- 只有「真正的外部互動」才該重置計時器:
  - Claude Code 的 hook 事件(對話還在進行中)
  - 使用者點擊 / 拖曳摸摸寵物
- 實作方式:`src/renderer.js` 裡用 `resetBoredom()`(真的重置)跟 `scheduleBoredom()`(**idempotent**,已经在倒數就不會被打斷重算)分開。新增一個自動觸發的閒置動畫時,呼叫 `enterOverride(...)` 記得帶上 `keepBoredom = true`(第 6 個參數),不要讓它重置計時器。

## 3. 方向翻轉(facing)有兩套機制,新增動畫前先想清楚要用哪一種

大部分靜態姿勢(idle、working、sad、wave...)只有一張畫面,天生就沒有「面向哪邊」的問題,`dinoWrap` 直接用 `scaleX(-1)` 鏡射整個角色來轉向——邏輯是「往左走就鏡射」,`REVERSED_FACING_ANIMS`(`src/renderer.js`)這個集合是留給「素材本身預設朝向跟大多數不同」的例外用的(目前是空的,之前 run 用過,後來 run 換成下面第二種機制就不需要了,但保留這個機制以防未來又有素材需要它)。

但 `walk`/`run`/`sleep` 這三個是**方向性動畫**——GIF 本身就分成 `-left`/`-right` 兩個檔案(各自畫好朝哪個方向),不是靠鏡射同一張圖做出兩個方向,所以完全不套用 `scaleX(-1)`:

- `DIRECTIONAL_GIF_ANIMS`(`src/renderer.js`)列出哪些 class 是這種「直接選左右圖」的動畫,`setPosition()` 裡會把這幾個 class 的 `imageMirror` 強制設成 `false`(不鏡射圖片本身),並在每一帧呼叫 `updateDirectionalGif()` 檢查方向有沒有變。
- `setDirectionalGif()` 依 `dir` 挑對應的 `_LEFT_SRC`/`_RIGHT_SRC`(`anim-sleep` 挑 `SLEEP_LEFT_SRC`/`SLEEP_RIGHT_SRC`,其他挑 `RUN_LEFT_SRC`/`RUN_RIGHT_SRC`)。
- `run`(單次直線衝刺)方向在動畫開始那一刻就固定,只需要在 `setAnim()` 進場時選一次圖;`walk`(隨意閒晃)途中會換好幾次目標、方向可能中途翻轉,所以還需要 `updateDirectionalGif()` 每一帧檢查——這是這兩者唯一的差別,新增類似的方向性動畫時,如果動畫進行中方向可能改變,記得把它加進 `DIRECTIONAL_GIF_ANIMS` 而不是只在 `setAnim()` 選一次就結束。
- 如果新動畫要貼一個跟著移動方向鏡射的表情符號(舊版 `run` 的沙塵 💨 就是這樣做的,現在已經拿掉了),做法是在 `setAnim()` 裡標記一個自訂 class,`style.css` 對應調整讓它跳過預設的 counter-flip——但這只適用於「用 `scaleX(-1)` 鏡射同一張圖」的動畫,方向性 GIF(上面這三個)因為圖本身已經是對的方向,通常不需要這層表情鏡射邏輯。

## 4. Hook 事件判斷:Notification 不能一律當作「回合仍在進行」

Claude Code 的 `Notification` hook 事件不只在「權限詢問」時觸發,閒置太久等你回覆時也會定期送出提醒(`notification_type === 'idle_prompt'`),不是每次都代表真的有事在發生。

- 只有 `notification_type === 'permission_prompt'` 才算「需要協助」(觸發 `anim-wave` ❗)、也才算「回合仍在進行」(重置 `turnActive` 並取消回到待機的倒數)。
- 其他類型的 Notification(像 idle_prompt)應該完全不影響動畫狀態,也不該重置任何計時器。

### Hook 沒有涵蓋到的情境,只能用時間去猜(而且會有誤判)

有些情境 Claude Code **沒有對應的 hook 事件**可以偵測,例如:「Bash 指令自己印出確認文字、卡在等終端機輸入」——這跟 Claude Code 自己的權限詢問是兩回事,不會有 `Notification`/`permission_prompt` 事件。

目前的做法(`main.js`):如果收到 `PreToolUse` 且 `tool_name === 'Bash'`,啟動一個計時器(`BASH_PENDING_THRESHOLD_MS`,目前 45 秒);如果時間內沒收到 `PostToolUse`/`PostToolUseFailure`(代表這個指令還在跑),就當作「可能卡住了」,合成一個假的 `{ hook_event_name: 'Notification', notification_type: 'permission_prompt' }` 事件送給 renderer,重用「需要協助」的動畫。

- **這是猜的,會有誤判**:單純跑很久的正常指令(`npm install`、build、跑測試)也會被誤判成卡住。這個門檻原本設 15 秒(跟權限詢問的門檻一樣),但實測發現使用者專案裡的 `tsc -b --noEmit` 這種型別檢查指令常態就超過 15 秒,導致同一個 session 連續好幾次被誤判成「需要協助」,幾乎每跑一次慢指令就跳一次(可以在 `logs/events.log` 裡看到同一個 `session_id` 短時間內連續多筆 `BashPendingTimeout`)——所以拉高到 45 秒,降低對這類正常慢指令的誤判頻率,換取真卡住時稍微慢一點才被提醒。
- 這個計時器是全域的(不是針對特定某次工具呼叫),所以下一個 `PostToolUse`/`PostToolUseFailure`/`Stop`/`UserPromptSubmit` 只要出現就會清掉它——**如果你自己手動測試這個功能,不要在等待期間又跑其他 Bash 指令**,不然那個指令自己的 `PostToolUse` 會把計時器清掉,誤以為沒觸發。

### 「使用者已經回應」沒有專屬的 hook 事件,不要只靠 Stop/UserPromptSubmit 判斷已解決

權限詢問(`Notification`/`permission_prompt`)被回答之後,Claude Code **不會**發送「已解決」這種事件——下一個真正會出現的事件通常是那個被核准的指令執行完畢的 `PostToolUse`(如果同一回合後面還有更多步驟,`Stop` 可能要很久之後才會發生)。

- `main.js` 裡任何「追蹤某個等待狀態、超過門檻就觸發提醒」的計時器(例如 `impatientTimeoutId`),清除條件都要包含 `PostToolUse`/`PostToolUseFailure`,不能只靠 `Stop`/`UserPromptSubmit`——不然使用者明明已經回應了,計時器卻感覺不到,門檻一到照樣觸發,而且會一直卡著直到真的 `Stop`。
- **這個問題反過來看也成立**:使用者「回答」權限詢問這件事本身,也完全沒有專屬的 hook 事件。如果被核准的指令本身跑很久(例如慢的 build/型別檢查),就算使用者已經按了 yes,畫面還是會停在「需要協助」甚至升級成「不耐煩」,一路卡到那個指令真正跑完(`PostToolUse`)為止——因為系統完全沒有「已經回答」的訊號可以參考。這不是誤判,是真的求助過,只是我們沒辦法知道「已經被回答」跟「還在等」的差別。
  - 做法:`ALERT_GIVE_UP_MS`(目前 30 秒,比 `IMPATIENT_THRESHOLD_MS` 15 秒還久)——如果一個真正的權限詢問超過這個時間都沒等到 `PostToolUse` 之類的解決事件,就**假設使用者已經回答了,只是指令還在跑**,自動釋放警示鎖定(`releaseAlert`)並合成一個 `PreToolUse`/Bash 事件切回工作中動畫,不再繼續卡在需要協助/不耐煩。
  - 這只套用在**真正的權限詢問**(`permissionPromptStartTime`/`permissionPromptSessionId`),**不套用在** `BashPendingTimeout` 那組合成出來的猜測性警示——因為那組本來就是「猜可能卡住」,沒有理由再疊加一層「假設已經處理」去把猜測性的警示提早蓋掉,那樣等於猜測完全失去意義。
  - 排這個計時器時要記住觸發當下的 `session_id`/`cwd`(用區域變數 closure 起來,不要依賴當時的全域變數),觸發時要檢查「現在的全域狀態還是不是同一個 session」才能動作,避免跟後來新進來的權限詢問互相干擾。

### 多個 Claude Code session 同時進行時,「需要協助」不能被別的 session 蓋掉,多個一起等你時要輪流顯示

Hooks 設定是全域的(`~/.claude/settings.json`),機器上任何 Claude Code session 都送到同一個桌寵。如果 A 對話跳出權限詢問、還在等你回答,這時候 B 對話送來一個普通的 `PreToolUse`,不能讓畫面被 B 的「工作中」蓋過去——不然 A 真正重要的求助信號就這樣消失了。如果 A、B 剛好**同時**都在等你,也不能只顯示其中一個、讓另一個完全隱形。

做法(`main.js`):用一個 `alertingSessions`(`Map<session_id, { cwd }>`)記住「現在有哪些 session 在等你」,`displayedAlertSessionId` 記住「畫面現在顯示的是哪一個」。

- **正在警示的 session 才擋得住別人**:只要 `alertingSessions` 不是空的,非「目前顯示中」的 session 傳來的一般事件一律用 `sendToPet(payload, session_id)` 擋掉(不轉發給 renderer)。等 `alertingSessions` 清空(所有警示都解決了),才恢復成誰的事件最新就顯示誰的正常行為。
- **超過一個 session 同時警示時,每 `ALERT_ROTATION_MS`(4 秒)輪流切換顯示**:`scheduleAlertRotation()` 排一個計時器,時間到就換下一個(`Map` 的插入順序循環),重新送一次那個 session 的警示 payload 給 renderer。只有一個在警示時不會輪詢(沒有下一個可以換)。
- 任何一個 session 解決了(`releaseAlert`),就把它從 `alertingSessions` 移除;如果移除的剛好是目前顯示中的那個,立刻切到還在警示的下一個(不用等下一次輪詢);如果只剩一個或清空了,輪詢計時器也會跟著停掉/重排。
- 新增任何會呼叫 `win.webContents.send('pet-event', ...)` 的地方,一律要改用 `sendToPet(payload, session_id)`,不要繞過這個機制直接送,不然又會出現「被蓋掉」的問題。
- `permissionPromptStartTime`/`bashPendingStartTime` 這些既有的全域計時器**沒有**跟著改成每個 session 一份(那是更大的重構),只有「畫面上顯示什麼」透過 `alertingSessions`/`displayedAlertSessionId` 管理,計時器本身還是全域、跟著最近一次觸發它的 session 走——**這代表如果 B 在 A 還沒解決前也觸發警示,B 會意外重置 A 的「15 秒不耐煩升級」倒數**,導致兩邊最終都不會顯示不耐煩動畫。這是已知、目前接受的限制(使用者確認不在意)。

### 在警示旁邊顯示專案名稱,這樣輪到哪個 session 才看得出來是誰

光是輪流顯示還不夠,寵物長相不會變,使用者得看到具體是哪個專案才有意義。做法:hook payload 本來就有 `cwd`,取路徑最後一段(專案資料夾名稱)顯示在警示表情旁邊,例如 `❗claude-pet`。

- `renderer.js` 的 `cwdLabel(cwd)` 負責取路徑最後一段;`mapHookEvent()` 裡「需要協助」(`permission_prompt`)、「不耐煩」(`ImpatientTimeout`)這兩個情境會把它接在 emoji 後面。
- `main.js` 合成的 `ImpatientTimeout`/`BashPendingTimeout` 事件本來不帶 `cwd`(那些是我們自己組出來的 payload,不是原始 hook payload),所以額外用 `permissionPromptCwd`/`bashPendingCwd` 這兩個全域變數記住觸發當下的 `cwd`,合成事件時一起帶上,不然這兩種情境永遠不會顯示專案名稱。
- 純 emoji 跟「emoji + 專案名稱」的顯示樣式差很多(一整串英文字母用 26px emoji 的字級會爆版、看不清楚),`setEmote()` 用 `/[a-zA-Z0-9]/.test(text)` 判斷內容裡有沒有英數字元,有的話加上 `emote-label` class,`style.css` 對應給它縮小字級、不換行、深色底的樣式,單純 emoji(不含英數字元)不受影響。
- 配合上面的輪詢機制,多個 session 同時警示時,專案名稱會跟著每次切換一起更新——所以看到的畫面是「❗claude-pet」播幾秒、換成「❗ok-web」播幾秒,一直循環,直到其中一個解決為止。

### 「回合中應該停在角落工作」的狀態,中途被打斷也要真的回得去角落

`corner: true` 的動畫(工作中、看代碼等)不是瞬間跳到角落,是用 `DASH_SPEED` 慢慢衝過去的(`movementLoop` 裡的 `overrideMoving` 邏輯)。如果衝去角落的路上被下一個事件打斷,而那個事件**沒有**設 `corner: true`,寵物會直接定格在半路那個隨機位置,不會真的到角落——這是先前踩到的實際 bug(工具呼叫太快結束,`PostToolUse` 在 `PreToolUse` 衝到角落之前就先觸發了)。

- `mapHookEvent()` 裡任何**應該讓寵物還停在角落**的情境(即使只是短暫的 `duration`,例如 `PostToolUse`/`PostCompact` 那種 ✨ 閃一下),都要記得加 `corner: true`,不要因為「反正很短暫」就省略,不然那短暫的瞬間就會定格在錯的地方。
- `enterCornerWorking()`(回合中間空檔停在角落的函式)**必須實際把寵物移動過去**(設 `overrideMoving = true` 跟 `targetX`/`targetY`),不能只是在原地凍結——因為呼叫它的時候,寵物完全有可能還在半路上,不是已經到角落了。
- 使用者互動(點擊摸摸、拖曳)如果打斷了回合中的工作狀態,結束後也要檢查 `turnActive`:還在回合中就呼叫 `enterCornerWorking()` 回到角落,不要無條件呼叫 `enterAuto()` 讓寵物整個脫離工作狀態跑去自由遊蕩。

## 5. 回合中間空檔的預設動畫

對話進行中(`turnActive === true`)如果收到目前沒特別對應到動畫的 hook 事件,或是某個動畫播完但回合還沒結束,一律 fallback 顯示「工作中」姿勢(`anim-working`),不要讓寵物卡在前一個動畫或變回待機——回合還沒結束就代表還在做事,不是閒置。

## 6. 檔案組織:有獨立行為的動畫,拆到自己的檔案;JS 跟圖片分開放

`src/renderer.js` 是共用的「引擎」(狀態、setAnim/setEmote/setPosition、hook 事件對應、滑鼠互動、無聊睡覺計時器等)。但像 jump / run 這種**自己會隨機觸發、有自己的進場邏輯**的動畫,不要塞進 `renderer.js`,而是拆成獨立檔案 `src/anims/<name>.js`(例如 `src/anims/run.js`),裡面放:`resolveGif()` 常數、`enter<Name>()`(如果有)、`scheduleRandom<Name>()`、檔案最下面自己呼叫一次 `scheduleRandom<Name>()`。

- **`src/anims/` 放「有自己獨立觸發邏輯」的動畫程式碼**(目前只剩 `jump.js`、`run.js`——會自己排隨機計時器、自己決定什麼時候進場),圖片全部集中在 `src/assets/nimbus/`,不再依動畫分子資料夾(舊版是 `src/assets/<name>/` 一個動畫一個資料夾,GIF 化之後已經不需要,一律用第 1 條的關鍵字比對從同一個資料夾找)。
- `index.html` 用**多個 plain `<script>` 標籤**依序載入(`src/renderer.js` 先,`src/anims/*.js` 在後),**不要用** `type="module"`。這個專案沒有 bundler,而多個 classic script 標籤本來就共用同一個頂層語彙作用域(`let`/`const` 互相看得到、也能互相賦值),所以 `src/anims/run.js` 裡可以直接讀寫 `renderer.js` 定義的 `mode`、`x`、`y`、`dir`、`setAnim()`、`enterOverride()`、`resolveGif()` 等,完全不需要 import/export,行為跟全部塞在同一個檔案裡一模一樣。改用 ES module 會被迫把所有直接賦值(`mode = 'run'` 這種)改成呼叫 setter,是不必要的高風險重構。
- 圖片路徑字串(`resolveGif()` 回傳的 `'src/assets/nimbus/xxx.gif'`)是相對於 `index.html`(專案根目錄)解析的,不是相對於 `.js` 檔案本身的位置。
- 純被動播放、沒有獨立觸發邏輯的動畫(working / reading / wave / sad / impatient / sleep / greet / success / pet / pat)**留在 `src/renderer.js` 裡**,不需要為了統一而每個都拆檔案——這些只是一個(或一對方向性的)`resolveGif()` 常數,由 `setAnim()`、`mapHookEvent()`、`previewAnim()` 這三個共用 switch 分派,拆檔案沒有實質好處。

## 7. 新增一個動畫關鍵字的檢查清單

現在「新增動畫」通常代表「幫某個目前還在用待機圖頂著的狀態(pet/pat/success 等)配上一個真正的 GIF」,不是從零生成一整組素材。步驟:

1. 確認新 GIF 已經放進 `src/assets/nimbus/`(檔名 `<前綴>-<關鍵字>.gif`,關鍵字不要跟現有的任何一個關鍵字構成子字串關係——見第 1 條)。
2. `src/renderer.js` 頂部加一行 `const <NAME>_SRC = resolveGif('<關鍵字>');`(如果是方向性的,像 sleep 那樣宣告 `_LEFT_SRC`/`_RIGHT_SRC` 兩個)。
3. 加進開頭的 image-warm 陣列(`[STAND_SRC, ...].forEach(...)`),讓它開機就預先載入。
4. `setAnim()` 裡加一個 `else if (cls === 'anim-<name>')`,設 `dinoImg.src = <NAME>_SRC;`(方向性的話呼叫 `setDirectionalGif()`,並把這個 class 加進 `DIRECTIONAL_GIF_ANIMS`——見第 3 條怎麼判斷要不要加)。
5. 如果這個狀態原本就存在、只是還在用待機圖頂著(例如 pet/pat/success),記得去掉 `setAnim()` 最後 `else` 分支裡提到它的註解,不然註解會變得不準。
6. 如果想讓右鍵選單能手動預覽 → `src/renderer.js` 的 `previewAnim()` 加一個 `case`,`main.js` 選單也加一行(目前整個「預覽動畫」子選單是註解掉的,先取消註解)。
7. `style.css` 通常不用改(除非要加額外的 CSS 動畫效果,例如 idle 的呼吸、reading 的歪頭——那是疊加在 GIF 之上的 CSS transform,跟 GIF 本身的畫面內容無關)。

## 8. 打包成獨立 `.app`,以及 Claude Code hooks 自動設定

`npm run dist`(`electron-builder`)會在 `dist/mac-arm64/ClaudePet.app` 產生一個完整獨立、不需要 Node.js 就能跑的 App,圖示是 `build/icon.icns`(`iconutil` 轉的,原始素材是舊版寵物待機圖 `dino.png`——那張圖跟其他寵物 PNG 一起被刪掉了,但轉好的 `.icns` 還留著繼續用;如果要換成跟現在角色一致的圖示,拿 `src/assets/nimbus/` 裡對應 `idle` 的那張 GIF 截一張靜態幀,重新跑一次 `iconutil` 轉檔即可)。分享給別人只要給這個檔案,不用給整個專案。

- **`main.js` 裡的 `configureClaudeHooks()`,每次 App 啟動(不管開發模式還是打包後)都會自動執行**,把必要的 hooks 合併進 `~/.claude/settings.json`(邏輯上跟以前獨立的 `scripts/configure-hooks.js` 一樣——保留其他設定、備份原檔、已設定過就跳過——現在直接內建進 App,不用另外跑腳本或手動編輯)。
- **打包後 `__dirname` 會指向唯讀的 `app.asar` 檔案內部,寫入會靜默失敗**(被 `logEvent` 的 try/catch 吞掉,不會報錯,只是永遠不會有記錄或設定寫入)——這是實際打包測試時才發現的坑。任何需要寫入檔案的路徑(目前是 `LOG_PATH`),都要用 `app.isPackaged` 判斷:開發模式維持用 `__dirname`(方便直接在專案資料夾裡找),打包後改用 `app.getPath('userData')`(Electron 提供的、保證可寫的每個 App 專屬資料夾)。之後如果新增其他需要寫檔的功能(例如之前討論過的每日提醒設定),也要記得套用同樣的判斷,不要只在開發模式測過就以為打包後也一定沒問題。
- 沒有 Apple 開發者憑證,`.app` 不會被簽章——本機建置的檔案直接執行沒問題,但透過網路傳輸的檔案會被標記「隔離」,對方電腦上第一次開啟可能被 Gatekeeper 擋,需要右鍵「開啟」而不是雙擊。

## 9. 多螢幕支援:視窗永遠只對應「一台」實體螢幕,拖到另一台就整個視窗搬過去

原本 `createWindow()` 只用 `screen.getPrimaryDisplay()` 的大小開視窗,寵物永遠被限制在主螢幕內,沒辦法拖到第二螢幕。**第一版做法(已放棄)**是把視窗開成所有螢幕的聯集外框,讓一個視窗同時涵蓋兩台螢幕。中間為了「自動活動不要兩邊亂跑」還做過 `homeDisplay`(把亂走/跑步/角落停靠限制在寵物目前所在的那一台螢幕範圍內,拖曳放開時用 `displayContaining()`/`nearestDisplay()` 判斷落在哪一台)。**但這整個方向後來被推翻了**,原因是:

- **實測發現:一個視窗真的橫跨兩台螢幕時,macOS 只會讓它在其中一台螢幕上正確顯示在其他視窗之上,另一台螢幕上會被真實視窗(例如 Warp、VS Code)蓋過去**,即使 Electron 自己回報 `win.isAlwaysOnTop()` 是 `true`、`CGWindowListCopyWindowInfo` 也回報這個視窗的 layer 是全系統最高的 `1000`,用 `win.webContents.capturePage()` 直接讀視窗自己的畫面也證實內容有正確畫出來——三個管道都說「這視窗在最上層、畫面是對的」,但實際螢幕截圖就是看不到。換過 `'screen-saver'`/`'floating'` 兩種 always-on-top 等級、`win.focus()`/`moveTop()` 強制取得焦點、把視窗縮小成只蓋住主螢幕大小(但位置還是跨螢幕的視窗實例)都沒用,唯獨换到「這視窗只覆蓋單一螢幕」(不管是哪一台)才會正常顯示。
  - 推測原因:macOS 預設「顯示器具有各自的桌面」(每台螢幕有自己獨立的一組 Spaces),一個視窗實際上只會真正「屬於」其中一個 Space/螢幕,幾何上延伸到另一台螢幕的部分雖然報告上是「同一個視窗、同樣最上層」,實際合成畫面時卻不會正確更新——這不是這個 App 寫錯,是這種橫跨多螢幕 + 高 always-on-top 等級視窗在這台機器這個系統設定下的真實限制。
- **最終做法:視窗永遠只對應目前所在的那一台實體螢幕,拖到另一台螢幕時把整個視窗搬過去**,而不是讓一個視窗同時橫跨兩者:
  - `main.js` 用一個模組層級的 `currentDisplay` 記錄視窗目前對應哪一台螢幕(`screen.getAllDisplays()` 裡的其中一個),`createWindow()` 一開始就把視窗的 `x/y/width/height` 直接設成 `screen.getPrimaryDisplay().bounds`,不再算任何聯集。
  - 新增 IPC `pet-drag-end`(renderer 在 `mouseup` 放開拖曳時,把 `e.screenX/e.screenY`——瀏覽器原生提供的「這個滑鼠事件在整個系統螢幕座標系的位置」——送給 main):main 用 `screen.getDisplayNearestPoint({x,y})` 算出滑鼠實際落在哪一台螢幕(這個 API 本身就會處理「掉進兩台螢幕沒對齊的縫隙」的情況,自動找最近的一台,不用自己再寫一個 `nearestDisplay()`)。如果跟 `currentDisplay` 是同一台就什麼都不做(代表這次拖曳沒離開原本的螢幕,renderer 自己那邊的本地拖曳邏輯就已經處理好了);如果是不同一台,就 `currentDisplay = target` 並 `win.setBounds(target.bounds)` 把整個視窗搬過去。
  - 視窗搬過去之後,把「這個視窗實際能安全畫圖的大小」(見下一條的 500ms 穩定延遲)跟「滑鼠放開時的位置換算成新視窗的本地座標」一起透過 `pet-init` 送給 renderer,renderer 收到後直接把寵物擺到那個位置、重新進入 `auto`/`idle`。拖曳途中(還沒放開前)寵物的視覺位置只會被夾在**目前這個視窗自己的範圍內**(拖過邊界就是貼著邊緣停住,不會消失),真正「跳到另一台螢幕」是放開滑鼠、main.js 真的把視窗搬過去之後才發生的,這是一個小小的、可接受的取捨(拖曳跨螢幕那一瞬間不會有「滑鼠拖著寵物畫面無縫滑過螢幕縫隙」的效果,只有放開後的瞬間定位)。
  - `renderer.js` 把原本的 `homeDisplay`/`displays`/`displayContaining()`/`nearestDisplay()` 整組都拿掉,改回單一的 `viewW`/`viewH`(目前這台螢幕的安全可畫範圍),`pickNewTarget()`、`pickRunTarget()`、角落停靠、地面線、拖曳時的夾取,全部都只用這兩個數字——等於是回到最初單一螢幕時的簡單寫法,只是這兩個數字現在是「目前對應到哪一台螢幕」動態決定的。
- **視窗建立/搬移後的穩定延遲,這次是單一螢幕自己的選單列坑,不是跨螢幕衝突**:即使只對應一台螢幕,macOS 還是會把視窗往下推一點以避開「這台螢幕自己的」選單列(這次觀察到的是 30px,不是之前兩台螢幕衝突時的 132px),而且創建/`setBounds()` 之後也不是馬上定案。所以不管是 `createWindow()` 剛建立時,還是 `pet-drag-end` 搬到新螢幕之後,都是同一個 `sendPetInit()`:等 500ms 讓位置穩定,再讀一次 `win.getBounds()`,用「這台螢幕的真實高度」減掉「macOS 往下推的量」算出 `viewW/viewH`,而不是直接信任建立/搬移當下要求的數字。
