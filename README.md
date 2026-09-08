# Agent Pet

Agent Pet 是一隻會反應 Claude Code 跟 Codex CLI 對話狀態的桌面寵物(Electron 桌面應用程式)。它會跟著你的 agent 目前在做什麼切換動畫——待機、工作中、看代碼、需要協助、出錯——寵物的長相完全由 GIF 圖檔決定,可以隨時換成任何相容的角色包。

## Features

- 閒置時自動待機、走路,偶爾跳躍或衝刺跑一段
- Claude Code / Codex 有動作時即時切換動畫:打字工作中、看代碼、需要協助、出錯等
- 寵物長相完全由 GIF 決定,右鍵選單就能換一整組外觀,不用寫程式
- macOS(Apple Silicon / Intel)、Windows 都有對應的桌面版本

## Supported agents

- Claude Code(CLI / VS Code 分機 / 終端機)
- Codex CLI

**目前不支援 Claude 桌面應用程式(claude.ai 的 app)跟 ChatGPT 桌面應用程式**,因為這兩個沒有開放跟上面兩者一樣的 hooks 機制讓外部程式接收工作狀態事件——裝了 Agent Pet 也只會看到一隻自己亂晃、對話不會有反應的寵物。

## Download / Getting started

最快的方式是直接下載打包好的版本:

- **[GitHub Releases](https://github.com/MoraLin/AgentPet-Downloads/releases)** — macOS(Apple Silicon / Intel)、Windows 安裝檔

下載後怎麼開啟、會遇到什麼系統警告,見下面「Unsigned beta builds」。想自己改程式碼或從原始碼建置,見下面「Development」/「Build」。

## Custom pets

寵物的長相全部來自一組 GIF 檔案,程式是用**檔名裡的關鍵字**去對應動作,不是寫死某個檔名——所以要換一隻寵物,只要:

1. 去 [codex-pets.net](https://codex-pets.net/) 挑一組角色的 GIF 包下載(或自己畫一組,只要檔名符合下面的關鍵字規則)。
2. 在寵物身上點右鍵,選「**匯入寵物外觀...**」,選到解壓縮後的資料夾就好。App 會自動檢查這個資料夾裡的 GIF 是否齊全,齊全就立刻套用;缺了什麼會直接告訴你缺什麼,不會套用一半。

檔名格式是 `<任意前綴>-<關鍵字>.gif`(例如 `dinosaur-idle.gif`),對應的關鍵字如下:

| 關鍵字                                           | 對應動作                                          |
| ------------------------------------------------ | ------------------------------------------------- |
| `idle`                                           | 待機、打招呼、摸摸                                |
| `running-left` / `running-right`                 | 閒晃走路、隨機衝刺跑一段(依方向自動選圖)          |
| `running`                                        | 工作中(打字/思考/整理上下文等,原地不動的忙碌狀態) |
| `jumping`                                        | 隨機跳一下                                        |
| `review`                                         | 在看代碼                                          |
| `waiting`                                        | 不耐煩(偵測到卡住了)                              |
| `waving`                                         | 需要協助(權限詢問)                                |
| `failed`                                         | 出錯(工具執行失敗)                                |
| `look-left-side` / `look-right-side`(**可省略**) | 閒置太久睡著(依方向自動選圖)                      |
| `success`(**可省略**)                            | 完成一個回合——沒有這張圖就顯示待機圖              |
| `eating`(**可省略**)                             | 閒置時偶爾自己吃東西                              |
| `playing`(**可省略**)                            | 閒置時偶爾自己玩                                  |

可省略的關鍵字沒有對應圖片時,會自動 fallback 或乾脆不觸發那個小動作;其他關鍵字都要有對應檔案。進階的動畫/皮膚規則(例如新增自訂動作、開發模式下怎麼放預設皮膚),見 [`docs/ANIMATION_GUIDELINES.md`](./docs/ANIMATION_GUIDELINES.md)。

## How it works

```
Claude Code / Codex hook  ->  本機 Agent Pet 事件接收服務  ->  寵物動畫狀態
```

Agent Pet 在背景跑一個只綁在你自己電腦(`127.0.0.1`)上的事件接收服務。啟動時會自動幫你設定好 Claude Code 跟 Codex 兩邊的 hooks,不用手動編輯任何設定檔;hook 觸發時,事件會送到這個服務,Agent Pet 再依內容切換寵物的動畫。

Codex 那邊比較特別:每次 hook 指令內容有變動,Codex 都會要求你在 `/hooks` 裡重新審核信任一次——這是 Codex 自己的安全機制,不是 bug,Agent Pet 偵測到這個情況時也會跳出提示告訴你怎麼做。

## Development

需要 [pnpm](https://pnpm.io/)(這個專案用 pnpm 管理套件,不是 npm)跟 Node.js `>=22.13`。

```bash
git clone <this-repo>
cd AgentPet
pnpm install
pnpm start
```

驗證:

```bash
pnpm run lint
pnpm test
```

`pnpm start` 跑起來的桌寵,存活時間跟那個終端機視窗綁在一起。想讓它開機自動啟動、當掉自動重開,macOS 可以設定 LaunchAgent,Windows/Linux 對應的是工作排程器(Task Scheduler)、systemd user service——概念一樣,細節請自行查閱對應平台的文件。

## Build

```bash
pnpm run dist        # macOS, Apple Silicon (arm64) → dist/Agent-Pet-arm64.dmg
pnpm run dist:x64    # macOS, Intel (x64)          → dist/Agent-Pet-x64.dmg
pnpm run dist:win    # Windows x64 (portable .exe) → dist/Agent-Pet-win.exe
```

三個指令互不影響,可以各自重跑。給別人的話直接給這一個檔案就好,不用給整個專案資料夾,對方也不需要裝 Node.js。

## Unsigned beta builds

Agent Pet 目前還在 beta 階段,macOS 跟 Windows 的建置都**還沒有數位簽章**。開啟時可能會遇到系統的安全性警告,這是預期中的行為,不代表檔案壞掉或有問題:

- **macOS**:透過網路傳輸的檔案(帶有「隔離」標記)可能會直接顯示「已損毀,無法打開」,而不是「開發者不明」——不是真的壞掉,是系統對未簽章 app 的處理方式。
- **Windows**:通常會被 SmartScreen 擋下,點「其他資訊」→「仍要執行」可以繼續;如果電腦開了「智慧型應用程式控制(Smart App Control)」,未簽章的程式會被直接封鎖,沒有「仍要執行」的選項。

如果不放心執行未簽章的執行檔,歡迎直接參考上面「Development」/「Build」,自己檢視原始碼、從頭建置。**我們不建議為了執行 Agent Pet 去關閉 Smart App Control 或其他作業系統的安全性防護**——未簽章不代表危險,但也不代表完全安全,請自行評估風險。

## Documentation

- [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) — 想貢獻程式碼
- [`docs/SECURITY.md`](./docs/SECURITY.md) — 安全性問題回報
- [`docs/ASSETS-LICENSE.md`](./docs/ASSETS-LICENSE.md) — 寵物素材/圖示授權
- [`docs/ANIMATION_GUIDELINES.md`](./docs/ANIMATION_GUIDELINES.md) — 動畫/皮膚系統的進階細節
- [`docs/agent-workflow.md`](./docs/agent-workflow.md) — 用 AI coding agent(Claude Code / Codex)協助開發這個專案時該遵守的工作流程

## License

原始碼採用 MIT License,詳見 [`LICENSE`](./LICENSE)。寵物 GIF 素材與部分圖示**不在 MIT 授權範圍內**,詳見 [`docs/ASSETS-LICENSE.md`](./docs/ASSETS-LICENSE.md)。
