import { Signal, signal } from '@angular/core';
import { AUDIO_EXT } from '../library.service';

export type ProviderId = 'gdrive' | 'onedrive';

export interface CloudEntry {
  id: string;
  name: string;
  folder: boolean;
  size: number;
  mime: string;
}

export interface CloudPage {
  entries: CloudEntry[];
  /** 下一頁的游標,沒有則代表已到最後 */
  next?: string;
}

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** 雲端來源的共同介面:登入、瀏覽資料夾、下載檔案 */
export abstract class CloudProvider {
  abstract readonly id: ProviderId;
  abstract readonly label: string;
  abstract readonly rootName: string;
  abstract readonly configured: Signal<boolean>;
  readonly connected = signal(false);

  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract list(folderId: string | null, pageToken?: string): Promise<CloudPage>;
  abstract download(entry: CloudEntry, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<File>;
}

export function isAudioEntry(name: string, mime: string): boolean {
  return mime.startsWith('audio/') || AUDIO_EXT.test(name);
}

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg',
  oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', weba: 'audio/webm',
};

/** 讀取回應內容並回報下載進度,包成 File */
export async function readFile(res: Response, name: string, mime: string, onProgress: (loaded: number) => void): Promise<File> {
  const type = mime.startsWith('audio/') ? mime : (MIME_BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? mime);
  if (!res.body) return new File([await res.blob()], name, { type });
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as BlobPart);
    loaded += value.byteLength;
    onProgress(loaded);
  }
  return new File(chunks, name, { type });
}

const scripts = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src);
        reject(new Error('無法載入登入元件,請確認網路連線'));
      };
      document.head.appendChild(el);
    });
    scripts.set(src, p);
  }
  return p;
}
