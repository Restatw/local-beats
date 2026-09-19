import { Page, expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeWav } from './audio';

const files = [
  { name: '周杰倫 - 晴天.wav', mimeType: 'audio/wav', buffer: makeWav(30, 440) },
  { name: 'Daft Punk - Get Lucky.wav', mimeType: 'audio/wav', buffer: makeWav(45, 523) },
  { name: 'no_artist_song.wav', mimeType: 'audio/wav', buffer: makeWav(5, 330) },
];

async function upload(page: Page, list = files) {
  await page.getByTestId('file-input').first().setInputFiles(list);
  await expect(page.getByTestId('track-row')).toHaveCount(list.length);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '音樂庫' })).toBeVisible();
  test.info().annotations.push({ type: 'errors', description: '' });
  (test.info() as unknown as { errs: string[] }).errs = errors;
});

test.afterEach(async ({}, info) => {
  const errs = (info as unknown as { errs: string[] }).errs;
  expect(errs, 'console / page errors').toEqual([]);
});

test('首次開啟顯示空狀態,manifest 與 SW 設定可取得', async ({ page, request }) => {
  await expect(page.getByText('還沒有音樂')).toBeVisible();
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect((await request.get('/icons/icon-512x512.png')).ok()).toBeTruthy();
  const ngsw = await (await request.get('/ngsw.json')).json();
  expect(ngsw.index).toBe('/index.html');
  await page.screenshot({ path: 'out/01-empty.png' });
});

test('上傳音樂:自動辨識演出者/歌名、顯示長度,重複檔案會被略過', async ({ page }) => {
  await upload(page);
  const rows = page.getByTestId('track-row');
  await expect(page.getByTestId('library-summary')).toContainText('3 首歌曲');
  await expect(rows.filter({ hasText: '晴天' })).toContainText('周杰倫');
  await expect(rows.filter({ hasText: '晴天' })).toContainText('0:30');
  await expect(rows.filter({ hasText: 'Get Lucky' })).toContainText('Daft Punk');
  await expect(rows.filter({ hasText: 'no artist song' })).toContainText('未知演出者');

  await page.getByTestId('file-input').first().setInputFiles([files[0], { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') }]);
  await expect(page.locator('.toast').last()).toContainText('1 首已存在');
  await expect(page.locator('.toast').last()).toContainText('1 個不是音訊檔');
  await expect(rows).toHaveCount(3);
  await page.screenshot({ path: 'out/02-library.png' });
});

test('上傳資料夾:匯入其中的音訊檔(含子資料夾),略過非音訊檔', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'album-'));
  mkdirSync(join(dir, 'disc2'));
  writeFileSync(join(dir, files[0].name), files[0].buffer);
  writeFileSync(join(dir, files[1].name), files[1].buffer);
  writeFileSync(join(dir, 'disc2', files[2].name), files[2].buffer);
  writeFileSync(join(dir, 'cover.jpg'), 'x');

  await page.getByTestId('folder-input').first().setInputFiles(dir);
  await expect(page.getByTestId('track-row')).toHaveCount(files.length);
  await expect(page.locator('.toast').last()).toContainText(`已匯入 ${files.length} 首`);
  await expect(page.locator('.toast').last()).toContainText('1 個不是音訊檔');
});

test('播放、暫停、下一首、上一首、進度與音量', async ({ page }) => {
  await upload(page);
  await page.getByRole('combobox').selectOption('title'); // 依歌名排序,順序固定

  const rows = page.getByTestId('track-row');
  const first = await rows.first().getByTestId('track-title').innerText();
  await rows.first().getByRole('button', { name: /^播放 / }).click();

  await expect(page.getByTestId('now-title')).toHaveText(first);
  await expect(page.getByTestId('play-toggle')).toHaveAccessibleName('暫停');
  await expect(page.getByTestId('time-current')).not.toHaveText('0:00', { timeout: 10_000 }); // 時間真的在走

  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('play-toggle')).toHaveAccessibleName('播放');
  const frozen = await page.getByTestId('time-current').innerText();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('time-current')).toHaveText(frozen);

  await page.getByRole('button', { name: '下一首' }).click();
  await expect(page.getByTestId('now-title')).not.toHaveText(first);
  await expect(page.getByTestId('play-toggle')).toHaveAccessibleName('暫停');
  await page.getByRole('button', { name: '上一首' }).click();
  await expect(page.getByTestId('now-title')).toHaveText(first);

  // 拖曳進度條
  const seek = page.getByRole('slider', { name: '播放進度' });
  await seek.evaluate((el: HTMLInputElement) => { el.value = '20'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.getByTestId('time-current')).toHaveText(/0:2\d/);

  // 靜音
  await page.getByRole('button', { name: '靜音' }).click();
  await expect(page.getByRole('button', { name: '取消靜音' })).toBeVisible();
  await page.screenshot({ path: 'out/03-playing.png' });
});

test('搜尋:歌名 / 演出者(含中文)/ 無結果', async ({ page }) => {
  await upload(page);
  await page.getByRole('link', { name: '搜尋' }).click();
  const box = page.getByRole('searchbox', { name: '搜尋' });
  await expect(box).toBeFocused();

  await box.fill('晴');
  await expect(page.getByTestId('track-row')).toHaveCount(1);
  await expect(page.getByTestId('track-title')).toHaveText('晴天');

  await box.fill('DAFT');
  await expect(page.getByTestId('track-row')).toHaveCount(1);
  await expect(page.getByTestId('track-title')).toHaveText('Get Lucky');

  await box.fill('zzzz');
  await expect(page.getByTestId('no-results')).toBeVisible();
  await page.screenshot({ path: 'out/04-search.png' });
});

test('選單:按讚、建立播放清單、加入/移除、重新命名、刪除歌曲', async ({ page }) => {
  await upload(page);
  const row = (name: string) => page.getByTestId('track-row').filter({ hasText: name });

  // 按讚
  await row('晴天').getByRole('button', { name: '按讚' }).click();
  await expect(row('晴天').getByRole('button', { name: '取消按讚' })).toBeVisible();
  await page.getByRole('link', { name: /已按讚的歌曲/ }).click();
  await expect(page.getByTestId('track-row')).toHaveCount(1);
  await page.getByRole('link', { name: '音樂庫', exact: true }).click();

  // 內容選單 → 新增播放清單(同時加入)
  await row('Get Lucky').getByRole('button', { name: '更多選項' }).click();
  await page.getByRole('menuitem', { name: '加入播放清單' }).click();
  await page.getByRole('menuitem', { name: /新增播放清單/ }).click();
  await page.getByRole('dialog').locator('input').fill('通勤歌單');
  await page.getByRole('dialog').getByRole('button', { name: '建立' }).click();
  await expect(page.locator('.toast').last()).toContainText('已加入「通勤歌單」');
  await expect(page.getByRole('link', { name: /通勤歌單/ })).toContainText('1');

  // 再加入一首;重複加入會提示
  await row('晴天').getByRole('button', { name: '更多選項' }).click();
  await page.getByRole('menuitem', { name: '加入播放清單' }).click();
  await page.getByRole('menuitem', { name: /通勤歌單/ }).click();
  await row('晴天').getByRole('button', { name: '更多選項' }).click();
  await page.getByRole('menuitem', { name: '加入播放清單' }).click();
  await page.getByRole('menuitem', { name: /通勤歌單/ }).click();
  await expect(page.locator('.toast').last()).toContainText('中已有這首歌');

  // 播放清單頁
  await page.getByRole('link', { name: /通勤歌單/ }).click();
  await expect(page.getByTestId('playlist-name')).toHaveText('通勤歌單');
  await expect(page.getByTestId('track-row')).toHaveCount(2);
  await page.screenshot({ path: 'out/05-playlist.png' });

  // 從清單移除(歌曲仍在音樂庫)
  await row('晴天').getByRole('button', { name: '更多選項' }).click();
  await page.getByRole('menuitem', { name: '從此播放清單移除' }).click();
  await expect(page.getByTestId('track-row')).toHaveCount(1);

  // 重新命名
  await page.getByRole('button', { name: '重新命名', exact: true }).click();
  await page.getByRole('dialog').locator('input').fill('週末');
  await page.getByRole('dialog').getByRole('button', { name: '儲存' }).click();
  await expect(page.getByTestId('playlist-name')).toHaveText('週末');

  // 從音樂庫刪除歌曲 → 播放清單/已按讚同步移除
  await page.getByRole('link', { name: '音樂庫', exact: true }).click();
  await row('Get Lucky').getByRole('button', { name: '更多選項' }).click();
  await page.getByRole('menuitem', { name: '從音樂庫刪除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '刪除' }).click();
  await expect(page.getByTestId('track-row')).toHaveCount(2);
  await expect(page.getByRole('link', { name: /週末/ })).toContainText('0');

  // 刪除播放清單
  await page.getByRole('button', { name: '刪除 週末' }).click({ force: true });
  await page.getByRole('dialog').getByRole('button', { name: '刪除' }).click();
  await expect(page.getByRole('link', { name: /週末/ })).toHaveCount(0);
});

test('資料留在本機:重新整理後歌曲、播放清單、按讚、音量都還在,且能繼續播放', async ({ page }) => {
  await upload(page);
  await page.getByTestId('track-row').filter({ hasText: '晴天' }).getByRole('button', { name: '按讚' }).click();
  await page.getByTestId('new-playlist').click();
  await page.getByRole('dialog').locator('input').fill('持久化測試');
  await page.getByRole('dialog').getByRole('button', { name: '建立' }).click();
  await expect(page.getByTestId('playlist-name')).toHaveText('持久化測試');
  await page.getByRole('link', { name: '音樂庫', exact: true }).click();
  await page.getByTestId('track-row').filter({ hasText: 'Get Lucky' }).getByRole('button', { name: /^播放 / }).click();
  await expect(page.getByTestId('now-title')).toHaveText('Get Lucky');

  const ls = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(ls).toEqual(expect.arrayContaining(['lb.tracks', 'lb.playlists', 'lb.liked', 'lb.last']));

  await page.reload();
  await expect(page.getByTestId('track-row')).toHaveCount(3);
  await expect(page.getByRole('link', { name: /持久化測試/ })).toBeVisible();
  await expect(page.getByTestId('track-row').filter({ hasText: '晴天' }).getByRole('button', { name: '取消按讚' })).toBeVisible();
  await expect(page.getByTestId('now-title')).toHaveText('Get Lucky'); // 還原上次的歌曲
  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('time-current')).not.toHaveText('0:00', { timeout: 10_000 }); // 音檔從 IndexedDB 讀回並可播放
});

test('PWA:service worker 啟用後可離線開啟並播放本機音樂', async ({ page, context }) => {
  await upload(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // 讓頁面被 SW 控制
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(3000); // 等預先快取完成

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('track-row')).toHaveCount(3);
  await page.getByTestId('track-row').first().getByRole('button', { name: /^播放 / }).click();
  await expect(page.getByTestId('play-toggle')).toHaveAccessibleName('暫停');
  await expect(page.getByTestId('time-current')).not.toHaveText('0:00', { timeout: 10_000 });
  await page.screenshot({ path: 'out/06-offline.png' });
  await context.setOffline(false);
});

test.describe('手機版面', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

  test('漢堡選單開關、無橫向捲動', async ({ page }) => {
    await upload(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: 'out/07-mobile.png' });

    await page.getByRole('button', { name: '開啟選單' }).click();
    await expect(page.locator('.sidebar')).toHaveClass(/open/);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'out/08-mobile-menu.png' });
    await page.getByRole('link', { name: '搜尋' }).click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  });
});
