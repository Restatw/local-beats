import { Injectable, computed, inject } from '@angular/core';
import { CloudConfigService } from './cloud-config.service';
import { CloudEntry, CloudPage, CloudProvider, HttpError, isAudioEntry, loadScript, readFile } from './cloud-provider';

const API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback: (e: { type: string }) => void;
      }): { requestAccessToken(overrides?: { prompt?: string }): void };
      revoke(token: string, done?: () => void): void;
    };
  };
}

/**
 * Google Drive:Google Identity Services(token 模式,純前端、無需 client secret)
 * 權限:drive.readonly(唯讀)。access token 只放記憶體,不寫入儲存空間。
 */
@Injectable({ providedIn: 'root' })
export class GoogleDriveProvider extends CloudProvider {
  readonly id = 'gdrive' as const;
  readonly label = 'Google Drive';
  readonly rootName = '我的雲端硬碟';

  private readonly cfg = inject(CloudConfigService);
  readonly configured = computed(() => !!this.cfg.config().googleClientId);

  private token = '';
  private expiresAt = 0;

  async connect(): Promise<void> {
    await loadScript('https://accounts.google.com/gsi/client');
    const google = (window as unknown as { google?: GoogleGlobal }).google;
    if (!google) throw new Error('無法載入 Google 登入元件');
    const res = await new Promise<TokenResponse>((resolve, reject) => {
      google.accounts.oauth2
        .initTokenClient({
          client_id: this.cfg.config().googleClientId,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          callback: (r) => (r.error ? reject(new Error(r.error)) : resolve(r)),
          error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? '已取消登入' : `登入失敗(${e.type})`)),
        })
        .requestAccessToken();
    });
    this.token = res.access_token ?? '';
    this.expiresAt = Date.now() + (res.expires_in ?? 3600) * 1000;
    this.connected.set(!!this.token);
  }

  disconnect(): void {
    const google = (window as unknown as { google?: GoogleGlobal }).google;
    if (this.token) google?.accounts.oauth2.revoke(this.token);
    this.token = '';
    this.expiresAt = 0;
    this.connected.set(false);
  }

  async list(folderId: string | null, pageToken?: string): Promise<CloudPage> {
    const params = new URLSearchParams({
      q: `'${folderId ?? 'root'}' in parents and trashed=false and (mimeType='${FOLDER}' or mimeType contains 'audio/' or mimeType='application/octet-stream')`,
      fields: 'nextPageToken,files(id,name,mimeType,size)',
      pageSize: '200',
      orderBy: 'folder,name',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const json = (await (await this.authed(`${API}?${params}`)).json()) as {
      nextPageToken?: string;
      files: { id: string; name: string; mimeType: string; size?: string }[];
    };
    const entries = json.files
      .map((f): CloudEntry => ({ id: f.id, name: f.name, folder: f.mimeType === FOLDER, size: Number(f.size ?? 0), mime: f.mimeType }))
      .filter((e) => e.folder || isAudioEntry(e.name, e.mime));
    return { entries, next: json.nextPageToken };
  }

  async download(entry: CloudEntry, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<File> {
    const res = await this.authed(`${API}/${encodeURIComponent(entry.id)}?alt=media&supportsAllDrives=true`, signal);
    return readFile(res, entry.name, entry.mime, onProgress);
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
