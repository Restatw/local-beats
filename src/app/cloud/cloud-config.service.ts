import { Injectable, signal } from '@angular/core';

export interface CloudConfig {
  googleClientId: string;
  microsoftClientId: string;
}

/** 讀取 cloud-config.json(部署時可替換,不必重新編譯) */
@Injectable({ providedIn: 'root' })
export class CloudConfigService {
  readonly config = signal<CloudConfig>({ googleClientId: '', microsoftClientId: '' });
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const res = await fetch('cloud-config.json', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as Partial<CloudConfig>;
      this.config.update((c) => ({
        googleClientId: json.googleClientId?.trim() ?? c.googleClientId,
        microsoftClientId: json.microsoftClientId?.trim() ?? c.microsoftClientId,
      }));
      this.loaded = true;
    } catch {
      /* 離線或檔案不是 JSON:視為尚未設定 */
    }
  }
}
