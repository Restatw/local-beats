# LocalBeats — Angular PWA 本機音樂播放器

Spotify 風格的音樂播放器。音樂與資料**只存在你的瀏覽器**,不會上傳到任何伺服器。

## 功能
- **上傳音樂**:按鈕多選、「上傳資料夾」整個資料夾(含子資料夾),或把檔案/資料夾拖進視窗(mp3 / m4a / aac / wav / ogg / opus / flac)。檔名「演出者 - 歌名」會自動辨識。
- **播放**:播放/暫停、上一首/下一首、進度、音量、隨機、重複(關/全部/單曲),支援手機鎖定畫面與耳機按鍵(Media Session)。
- **搜尋**:即時搜尋歌名、演出者、播放清單。
- **選單**:左側導覽(音樂庫 / 搜尋 / 已按讚 / 播放清單);每首歌的「⋯」選單可播放、按讚、加入播放清單、從清單移除、刪除;播放清單可建立、重新命名、刪除。
- **PWA**:可安裝到桌面/手機,離線也能開啟並播放。
- **本機儲存**:
  - `localStorage`:曲目資訊、播放清單、按讚、音量/隨機/重複、上次播放
  - `IndexedDB`:音樂檔案本體(localStorage 僅約 5MB,放不下音檔)

## 用 Docker 執行(不需安裝 Node)
```bash
docker compose up -d --build web        # 正式版(nginx + service worker) → http://localhost:8080
docker compose --profile dev up dev     # 開發模式(熱重載)              → http://localhost:4200
docker compose --profile test run --rm e2e   # Playwright 端對端測試(截圖輸出到 e2e/out/)
```
> service worker 只在正式版啟用,且需要 `localhost` 或 HTTPS。

## 專案結構
```
src/app/
  library.service.ts   曲目 / 播放清單 / 按讚(signals + localStorage)
  storage.service.ts   localStorage 與 IndexedDB 封裝
  player.service.ts    <audio> 播放、佇列、Media Session
  track-list.ts        曲目清單與「⋯」選單
  sidebar.ts / player-bar.ts / pages/*
e2e/                   Playwright 測試(在 Docker 內執行)
```

## 雲端匯入設定(Google Drive / OneDrive)

側邊欄「從雲端匯入」可瀏覽你的雲端硬碟、勾選音樂,下載後**複製到本機**(IndexedDB),之後可離線播放。純前端直連,沒有自己的後端;只要求**唯讀**權限,登入資訊(access token)只放在記憶體、關掉頁面就消失。

把取得的 Client ID 填入 `public/cloud-config.json`(只需要填你要用的那一家):
```json
{ "googleClientId": "xxxx.apps.googleusercontent.com", "microsoftClientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```
Docker 的 `web` 服務已把這個檔案掛載進容器,**改完存檔、重新整理頁面即可,不必重新建置**。

### Google Drive
1. [Google Cloud Console](https://console.cloud.google.com/) 建立專案 → 啟用 **Google Drive API**。
2. 「OAuth 同意畫面」:User Type 選外部,加入範圍 `.../auth/drive.readonly`;發布狀態維持「測試中」時,把自己的 Google 帳號加進**測試使用者**即可(不需要通過審核)。
3. 「憑證」→ 建立 **OAuth 用戶端 ID**,類型 **網頁應用程式**,「已授權的 JavaScript 來源」加入 `http://localhost:8080`(以及你實際部署的 HTTPS 網址)。不需要設定重新導向 URI。
4. 把用戶端 ID 填入 `googleClientId`。

> `drive.readonly` 屬於敏感範圍:自己或少數測試使用者使用沒有問題;若要公開給任意使用者,Google 會要求應用程式驗證。

### OneDrive
1. [Azure 入口網站](https://portal.azure.com/) →「應用程式註冊」→ 新增註冊,支援的帳戶類型選**任何組織目錄中的帳戶和個人 Microsoft 帳戶**。
2. 「驗證」→ 新增平台 → **單頁應用程式**,重新導向 URI 填 `http://localhost:8080/auth-callback.html`(部署後再加上 `https://你的網域/auth-callback.html`)。
3. 「API 權限」確認有 Microsoft Graph 的委派權限 `Files.Read`(預設會帶 `User.Read`,可保留)。
4. 把「應用程式(用戶端)識別碼」填入 `microsoftClientId`。

### 注意
- 登入是彈出視窗,請允許瀏覽器彈出視窗。
- 已存在(同檔名、同大小)的歌曲會直接略過、不會重複下載。
- 大量匯入會佔用瀏覽器儲存空間;瀏覽器可能在空間不足時清除網站資料,重要的音樂請保留雲端原檔。

## 部署到 Cloudflare Pages(https://beats.re95.org)

push 到 `master` 時,`.github/workflows/deploy.yml` 會建置並用 wrangler 上傳到 Cloudflare Pages。快取規則在 `public/_headers`、SPA 路由在 `public/_redirects`(建置時會一併輸出)。

一次性設定:
1. **建立 Pages 專案**(Direct Upload 類型,名稱需與 workflow 的 `--project-name` 一致):
   ```bash
   npx wrangler pages project create local-beats --production-branch=master
   ```
2. **API Token**:Cloudflare → My Profile → API Tokens → 建立自訂 token,權限 `Account › Cloudflare Pages › Edit`。
3. **GitHub Secrets**(repo → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN`:上一步的 token
   - `CLOUDFLARE_ACCOUNT_ID`:Cloudflare 儀表板右側或網址中的帳戶 ID
4. **自訂網域**:Pages 專案 → Custom domains → 加入 `beats.re95.org`(`re95.org` 的 DNS 需在 Cloudflare,會自動建立 CNAME)。
5. **OAuth 來源**:Google 用戶端 ID 的「已授權的 JavaScript 來源」加入 `https://beats.re95.org`;OneDrive 的重新導向 URI 加入 `https://beats.re95.org/auth-callback.html`。
6. (建議)Cloudflare 關閉 Rocket Loader 與 Auto Minify,以免改寫 service worker。

之後在 Actions 分頁也可手動觸發(workflow_dispatch)重新部署。
