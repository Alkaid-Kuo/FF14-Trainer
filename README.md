# 絕神兵練習器（UWU Trainer）

FF14 絕神兵（P1 迦樓羅、P2 伊弗利特、P3 泰坦）的機制練習器，打法依照萌神神攻略。
單一 HTML 檔，可以離線單人練習，也可以連線多人一起練。

- 網址：部署好的 `https://ff14-trainer.<帳號>.workers.dev`，單人、多人都用這個。
- 離線：把網頁存成檔案（或下載 `server/public/index.html`）直接用瀏覽器開，單人可用；連線區填上面的網址也能連線。
- 多人：一人建房，其他人輸入房號加入。

## 檔案結構

| 路徑 | 內容 |
| --- | --- |
| `src/` | 原始碼：`core.js` 模擬核心、`p1.js`／`p2.js`／`p3.js` 各階段、`render2d.js`／`render3d.js` 畫面、`net.js` 連線同步、`ui.js` 介面 |
| `vendor/three.min.js` | three.js r160 |
| `build.py` | 打包成單一 HTML，輸出到 `server/public/index.html` |
| `server/` | 連線伺服器：Cloudflare Worker＋Durable Object（`worker.js`）；`public/` 是網頁本體 |
| `wrangler.jsonc` | Cloudflare 部署設定 |
| `tests/` | 模擬回歸測試（`node tests/test_p3.js 300`） |
| `gen/` | 從攻略圖檔擷取站位用的腳本 |

## 建置

```sh
python3 build.py
```

`server/public/index.html` 是建置產物，但要一起提交，Cloudflare 部署時直接拿它當網頁。

## 部署到 Cloudflare（第一次設定）

1. 註冊 [Cloudflare](https://dash.cloudflare.com/sign-up) 免費帳號。
2. Dashboard → **Workers & Pages** → **Create** → **Import a repository**，連結 GitHub 並選這個 repo。
3. 設定：
   - Project name：`ff14-trainer`（要跟 `wrangler.jsonc` 的 `name` 一樣）
   - Root directory：留空（`/`）
   - Build command：留空
   - Deploy command：`npx wrangler deploy`（預設值）
4. 按 Deploy。完成後會拿到 `https://ff14-trainer.<帳號>.workers.dev`，把這個網址給隊友即可。

之後每次推到 main 分支，Cloudflare 會自動重新部署，網址不變，大家重新整理就是新版。

## 連線玩法

- **房主**：建房的人。房主的瀏覽器負責跑模擬，控制開始／暫停／階段／起始點／打法。
  - 可以在成員名單把房主轉讓給別人。
  - 房主斷線時，自動交給最早進房的人，從最近的檢查點重新開始。
- **隊員**：自己的角色由自己操作（本機即時移動），其他人與機制跟著房主的畫面。
  - 可以點上方職位換成沒人用的職位，也可以開 AI 代打。
- 2–8 人，沒人的職位由 AI 補。第 9、10 人進房會變成觀戰。
- 任何人死亡就算全滅（自殺流的計畫倒地除外）。
- 連線時固定 1 倍速；標點全隊共用。

## 本機測試伺服器

```sh
npx wrangler dev   # 在 repo 最上層執行，http://127.0.0.1:8787
```

## 免費額度

Workers 免費方案的 Durable Objects 每天有 100,000 次請求，UTC 00:00 重置。

- 收到的 WebSocket 訊息每 20 則算 1 次請求。
- 房主每秒送 20 次畫面；隊員只在移動時送位置，每秒最多 15 次。
- 估算可玩時間：
  - 8 人：約每秒 4–6 次請求，每天約 4–7 小時連續練習。
  - 4 人：約每秒 2–3 次請求，每天約 9–14 小時。
- 超過額度當天會連不上（單人不受影響）。需要更多額度可以升級 Workers Paid（每月 5 美元）。
