import { BrowserContext, Page, Route, expect, test } from '@playwright/test';
import { makeWav } from './audio';

// service worker 接手請求後 page.route 就攔不到,這裡的測試不需要 SW
test.use({ serviceWorkers: 'block' });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const preflight = (route: Route) => route.request().method() === 'OPTIONS' && route.fulfill({ status: 204, headers: CORS }).then(() => true);

async function configure(page: Page, cfg: { googleClientId: string; microsoftClientId: string }) {
  await page.route('**/cloud-config.json', (r) => json(r, cfg));
}

async function openDialog(page: Page, tab: string) {
  await page.goto('/');
  await page.getByTestId('cloud-open').first().click();
  await page.getByRole('tab', { name: tab }).click();
}

test('尚未設定 Client ID 時顯示設定說明', async ({ page }) => {
  await configure(page, { googleClientId: '', microsoftClientId: '' });
  await openDialog(page, 'Google Drive');
  await expect(page.getByTestId('cloud-unconfigured')).toContainText('googleClientId');
  await page.getByRole('tab', { name: 'OneDrive' }).click();
  await expect(page.getByTestId('cloud-unconfigured')).toContainText('microsoftClientId');
});

test.describe('Google Drive', () => {
  test('登入 → 瀏覽資料夾 → 多選匯入 → 本機播放;重複匯入會略過', async ({ page }) => {
    await configure(page, { googleClientId: 'test-google-id', microsoftClientId: '' });
    await page.route('https://accounts.google.com/gsi/client', (r) =>
      r.fulfill({
        contentType: 'text/javascript',
        body: `window.google = { accounts: { oauth2: {
          initTokenClient: (cfg) => { window.__gcfg = cfg; return { requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'g-token', expires_in: 3600 }), 10) }; },
          revoke: () => {} } } };`,
      }),
    );
    const downloads: string[] = [];
    await page.route(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files/, async (route) => {
      if (await preflight(route)) return;
      const req = route.request();
      if (req.headers()['authorization'] !== 'Bearer g-token') return json(route, { error: 'unauthorized' }, 401);
      const url = new URL(req.url());
      if (url.searchParams.get('alt') === 'media') {
        const id = decodeURIComponent(url.pathname.split('/').pop()!);
        downloads.push(id);
        return route.fulfill({ headers: { ...CORS, 'content-type': 'audio/wav' }, body: makeWav(id === 'a1' ? 20 : 25, id === 'a1' ? 440 : 660) });
      }
      const q = url.searchParams.get('q')!;
      if (q.includes("'root' in parents")) {
        return json(route, { files: [
          { id: 'fMusic', name: 'Music', mimeType: 'application/vnd.google-apps.folder' },
          { id: 'a0', name: 'Solo - Root Track.wav', mimeType: 'audio/wav', size: '80000' },
        ] });
      }
      if (q.includes("'fMusic' in parents")) {
        return json(route, { files: [
          { id: 'a1', name: 'Band X - Alpha.wav', mimeType: 'audio/wav', size: String(makeWav(20, 440).length) },
          { id: 'a2', name: 'Band X - Beta.wav', mimeType: 'audio/wav', size: String(makeWav(25, 660).length) },
          { id: 'x1', name: 'cover.jpg', mimeType: 'application/octet-stream', size: '10' }, // 非音訊,應被過濾
        ] });
      }
      return json(route, { files: [] });
    });

    await openDialog(page, 'Google Drive');
    await page.getByTestId('cloud-login').click();
    await expect(page.getByTestId('cloud-folder')).toHaveText(/Music/);
    // 登入完成後,確認送給 Google 的是我們設定的 Client ID 與唯讀範圍
    expect(await page.evaluate(() => (window as any).__gcfg.client_id)).toBe('test-google-id');
    expect(await page.evaluate(() => (window as any).__gcfg.scope)).toBe('https://www.googleapis.com/auth/drive.readonly');
    await expect(page.getByTestId('cloud-entry')).toHaveCount(1);
    await page.getByTestId('cloud-folder').click();
    await expect(page.getByTestId('cloud-entry')).toHaveCount(2); // cover.jpg 已被過濾
    await page.getByRole('button', { name: '全選本頁' }).click();
    await expect(page.getByTestId('cloud-selected')).toHaveText('已選 2 首');
    await page.screenshot({ path: 'out/09-cloud-dialog.png' });
    await page.getByTestId('cloud-import').click();

    await expect(page.locator('.toast').last()).toContainText('已匯入 2 首');
    await expect(page.getByTestId('cloud-list')).toHaveCount(0); // 匯入完成後對話框自動關閉
    await expect(page.getByTestId('track-row')).toHaveCount(2);
    expect(downloads.sort()).toEqual(['a1', 'a2']);

    // 播放的是從 IndexedDB 讀出來的本機副本
    await page.getByTestId('track-row').filter({ hasText: 'Alpha' }).getByRole('button', { name: /^播放 / }).click();
    await expect(page.getByTestId('now-artist')).toHaveText('Band X');
    await expect(page.getByTestId('time-current')).not.toHaveText('0:00', { timeout: 10_000 });

    // 再匯入一次 → 不會重新下載
    await page.getByTestId('cloud-open').first().click();
    // 仍在登入狀態,直接回到根目錄
    await page.getByTestId('cloud-folder').click();
    await page.getByRole('button', { name: '全選本頁' }).click();
    await page.getByTestId('cloud-import').click();
    await expect(page.locator('.toast').last()).toContainText('2 首已存在');
    expect(downloads).toHaveLength(2);
  });

  test('登入被取消時顯示錯誤,可再試一次', async ({ page }) => {
    await configure(page, { googleClientId: 'x', microsoftClientId: '' });
    await page.route('https://accounts.google.com/gsi/client', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: `window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: () => cfg.error_callback({ type: 'popup_closed' }) }) } } };` }),
    );
    await openDialog(page, 'Google Drive');
    await page.getByTestId('cloud-login').click();
    await expect(page.getByRole('alert')).toHaveText('已取消登入');
    await expect(page.getByTestId('cloud-login')).toBeVisible();
  });
});

test.describe('OneDrive', () => {
  async function mockMicrosoft(context: BrowserContext, page: Page, seen: { authorize?: URL; tokenBody?: string; downloadAuth?: string | undefined }) {
    await context.route(/^https:\/\/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize/, (route) => {
      const u = new URL(route.request().url());
      seen.authorize = u;
      route.fulfill({ status: 302, headers: { location: `${u.searchParams.get('redirect_uri')}?code=auth-code-1&state=${u.searchParams.get('state')}` } });
    });
    await page.route('https://login.microsoftonline.com/common/oauth2/v2.0/token', async (route) => {
      if (await preflight(route)) return;
      seen.tokenBody = route.request().postData() ?? '';
      json(route, { access_token: 'ms-token', expires_in: 3600, token_type: 'Bearer' });
    });
    await page.route(/^https:\/\/graph\.microsoft\.com\/v1\.0\/me\/drive/, async (route) => {
      if (await preflight(route)) return;
      if (route.request().headers()['authorization'] !== 'Bearer ms-token') return json(route, { error: {} }, 401);
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/root/children')) {
        return json(route, { value: [
          { id: 'd1', name: 'Songs', folder: { childCount: 1 } },
          { id: 'n1', name: 'notes.txt', size: 5, file: { mimeType: 'text/plain' } },
        ] });
      }
      if (path.endsWith('/items/d1/children')) {
        return json(route, { value: [{ id: 'f1', name: 'Gamma Band - Gamma.wav', size: makeWav(15, 500).length, file: { mimeType: 'audio/wav' } }] });
      }
      if (path.endsWith('/items/f1')) return json(route, { id: 'f1', '@microsoft.graph.downloadUrl': 'https://download.example.test/f1' });
      return json(route, { value: [] });
    });
    await page.route('https://download.example.test/**', (route) => {
      seen.downloadAuth = route.request().headers()['authorization'];
      route.fulfill({ headers: { ...CORS, 'content-type': 'audio/wav' }, body: makeWav(15, 500) });
    });
  }

  test('PKCE 登入(彈出視窗)→ 瀏覽 → 匯入;下載網址不帶授權標頭', async ({ page, context }) => {
    await configure(page, { googleClientId: '', microsoftClientId: 'test-ms-id' });
    const seen: { authorize?: URL; tokenBody?: string; downloadAuth?: string | undefined } = {};
    await mockMicrosoft(context, page, seen);

    await openDialog(page, 'OneDrive');
    await page.getByTestId('cloud-login').click();

    await expect(page.getByTestId('cloud-folder')).toHaveText(/Songs/);
    await expect(page.getByTestId('cloud-entry')).toHaveCount(0); // notes.txt 被過濾
    const a = seen.authorize!.searchParams;
    expect(a.get('client_id')).toBe('test-ms-id');
    expect(a.get('response_type')).toBe('code');
    expect(a.get('code_challenge_method')).toBe('S256');
    expect(a.get('scope')).toBe('Files.Read');
    expect(a.get('redirect_uri')).toMatch(/\/auth-callback\.html$/);
    const body = new URLSearchParams(seen.tokenBody);
    expect(body.get('code')).toBe('auth-code-1');
    expect(body.get('code_verifier')!.length).toBeGreaterThanOrEqual(43);
    expect(body.get('client_id')).toBe('test-ms-id');

    await page.getByTestId('cloud-folder').click();
    await page.getByTestId('cloud-entry').getByRole('checkbox').check();
    await page.getByTestId('cloud-import').click();
    await expect(page.locator('.toast').last()).toContainText('已匯入 1 首');
    await expect(page.getByTestId('track-row')).toContainText('Gamma Band');
    expect(seen.downloadAuth).toBeUndefined();
    await page.screenshot({ path: 'out/10-after-onedrive.png' });
  });

  test('關掉登入視窗 → 顯示「已取消登入」', async ({ page, context }) => {
    await configure(page, { googleClientId: '', microsoftClientId: 'test-ms-id' });
    await context.route(/login\.microsoftonline\.com/, () => { /* 不回應,模擬使用者還在登入頁 */ });
    await openDialog(page, 'OneDrive');
    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('cloud-login').click();
    (await popupPromise).close();
    await expect(page.getByRole('alert')).toHaveText('已取消登入');
  });
});

test('匯入中可以取消', async ({ page }) => {
  await configure(page, { googleClientId: 'g', microsoftClientId: '' });
  await page.route('https://accounts.google.com/gsi/client', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: `window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: () => cfg.callback({ access_token: 't', expires_in: 3600 }) }) } } };` }),
  );
  await page.route(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files/, async (route) => {
    if (await preflight(route)) return;
    const url = new URL(route.request().url());
    if (url.searchParams.get('alt') === 'media') return; // 永遠不回應 → 一直在下載
    return json(route, { files: [{ id: 's1', name: 'Slow - Song.wav', mimeType: 'audio/wav', size: '1000' }] });
  });
  await openDialog(page, 'Google Drive');
  await page.getByTestId('cloud-login').click();
  await page.getByTestId('cloud-entry').getByRole('checkbox').check();
  await page.getByTestId('cloud-import').click();
  await expect(page.getByTestId('cloud-progress')).toContainText('Slow - Song.wav');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.toast').last()).toContainText('已取消');
  await expect(page.getByTestId('cloud-progress')).toHaveCount(0);
});
