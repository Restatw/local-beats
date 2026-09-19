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
