import { Injectable, computed, inject } from '@angular/core';
import { CloudConfigService } from './cloud-config.service';
import { CloudEntry, CloudPage, CloudProvider, HttpError, isAudioEntry, readFile } from './cloud-provider';

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'Files.Read';

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a);
}

interface GraphItem {
  id: string;
  name: string;
  size?: number;
  folder?: unknown;
  file?: { mimeType?: string };
  '@microsoft.graph.downloadUrl'?: string;
}

/**
 * OneDrive:Microsoft identity platform 的授權碼 + PKCE(SPA 不需要 client secret)。
 * 權限:Files.Read(唯讀)。access token 只放記憶體,不寫入儲存空間。
 */
@Injectable({ providedIn: 'root' })
export class OneDriveProvider extends CloudProvider {
  readonly id = 'onedrive' as const;
  readonly label = 'OneDrive';
  readonly rootName = 'OneDrive';

  private readonly cfg = inject(CloudConfigService);
  readonly configured = computed(() => !!this.cfg.config().microsoftClientId);

  private token = '';
  private expiresAt = 0;

  async connect(): Promise<void> {
    // 先同步開視窗(否則會被瀏覽器當成非使用者操作而擋掉),再導向授權頁
    const popup = window.open('about:blank', 'lb-onedrive-login', 'width=520,height=680');
    if (!popup) throw new Error('瀏覽器擋住了登入視窗,請允許彈出視窗後再試一次');

    try {
      const clientId = this.cfg.config().microsoftClientId;
      const redirectUri = `${location.origin}/auth-callback.html`;
      const verifier = randomString(48);
      const state = randomString(16);
      const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));

      popup.location.href =
        `${AUTHORITY}/authorize?` +
        new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          response_mode: 'query',
          scope: SCOPE,
          state,
          code_challenge: challenge,
          code_challenge_method: 'S256',
        });

      const code = await this.waitForCode(popup, state);
      const res = await fetch(`${AUTHORITY}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
          scope: SCOPE,
        }),
      });
      const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
      if (!res.ok || !json.access_token) throw new Error(json.error_description?.split('\r')[0] ?? '登入失敗');
      this.token = json.access_token;
      this.expiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
      this.connected.set(true);
    } finally {
      if (!popup.closed) popup.close();
    }
  }

  disconnect(): void {
    this.token = '';
    this.expiresAt = 0;
    this.connected.set(false);
  }

  async list(folderId: string | null, pageToken?: string): Promise<CloudPage> {
    const path = folderId ? `/me/drive/items/${encodeURIComponent(folderId)}/children` : '/me/drive/root/children';
    const url = pageToken ?? `${GRAPH}${path}?${new URLSearchParams({ $select: 'id,name,size,folder,file', $top: '200', $orderby: 'name' })}`;
    const json = (await (await this.authed(url)).json()) as { value: GraphItem[]; '@odata.nextLink'?: string };
    const entries = json.value
      .map((i): CloudEntry => ({ id: i.id, name: i.name, folder: !!i.folder, size: i.size ?? 0, mime: i.file?.mimeType ?? '' }))
      .filter((e) => e.folder || isAudioEntry(e.name, e.mime));
    return { entries, next: json['@odata.nextLink'] };
  }

  async download(entry: CloudEntry, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<File> {
    // 下載網址已預先授權且會過期,所以每次都重新取得;對它發請求不能帶 Authorization
    const meta = (await (await this.authed(`${GRAPH}/me/drive/items/${encodeURIComponent(entry.id)}`, signal)).json()) as GraphItem;
    const url = meta['@microsoft.graph.downloadUrl'];
    if (!url) throw new Error('取不到下載網址');
    const res = await fetch(url, { signal });
    if (!res.ok) throw new HttpError(res.status);
    return readFile(res, entry.name, entry.mime, onProgress);
  }

  private waitForCode(popup: Window, state: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const finish = (fn: () => void) => {
        window.removeEventListener('message', onMessage);
        clearInterval(timer);
        fn();
      };
      const onMessage = (e: MessageEvent) => {
        if (e.origin !== location.origin || e.data?.type !== 'lb-oauth') return;
        const q = new URLSearchParams(e.data.query as string);
        if (q.get('state') !== state) return;
        const code = q.get('code');
        finish(() => (code ? resolve(code) : reject(new Error(q.get('error_description') ?? q.get('error') ?? '登入失敗'))));
      };
      const timer = setInterval(() => popup.closed && finish(() => reject(new Error('已取消登入'))), 500);
      window.addEventListener('message', onMessage);
    });
  }

  private async authed(url: string, signal?: AbortSignal, retry = true): Promise<Response> {
    if (!this.token || Date.now() > this.expiresAt - 60_000) await this.connect();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` }, signal });
    if (res.status === 401 && retry) {
      this.expiresAt = 0;
      return this.authed(url, signal, false);
    }
    if (!res.ok) throw new HttpError(res.status);
    return res;
  }
}
