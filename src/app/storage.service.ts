import { Injectable } from '@angular/core';

const DB_NAME = 'local-beats';
const STORE = 'audio';

/**
 * localStorage:曲目資訊、播放清單、設定(小型 JSON)
 * IndexedDB:音樂檔案本體(localStorage 只有約 5MB,放不下音檔)
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private dbPromise?: Promise<IDBDatabase>;

  load<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  save(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 額度已滿或被停用 */
    }
  }

  putBlob(id: string, blob: Blob): Promise<unknown> {
    return this.tx('readwrite', (s) => s.put(blob, id));
  }

  getBlob(id: string): Promise<Blob | undefined> {
    return this.tx<Blob | undefined>('readonly', (s) => s.get(id));
  }

  deleteBlob(id: string): Promise<unknown> {
    return this.tx('readwrite', (s) => s.delete(id));
  }

  /** 請瀏覽器盡量不要自動清除本站資料 */
  async requestPersistence(): Promise<void> {
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* ignore */
    }
  }

  private db(): Promise<IDBDatabase> {
    return (this.dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  }
}
