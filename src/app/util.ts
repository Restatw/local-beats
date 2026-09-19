export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTotal(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${Math.max(m, sec > 0 ? 1 : 0)} 分鐘`;
}

/** 依 id 產生固定的漸層封面 */
export function coverGradient(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  const b = (a + 40 + ((h >>> 8) % 80)) % 360;
  return `linear-gradient(135deg, hsl(${a} 65% 46%), hsl(${b} 70% 28%))`;
}

export function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase().trim();
}

/** 「演出者 - 歌名.mp3」→ { artist, title };其他格式整個檔名當歌名 */
export function parseFileName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const idx = base.indexOf(' - ');
  if (idx > 0 && idx < base.length - 3) {
    return { artist: base.slice(0, idx).trim(), title: base.slice(idx + 3).trim() };
  }
  return { artist: '未知演出者', title: base || '未命名' };
}

/**
 * 取出拖曳內容中的所有檔案,資料夾會遞迴展開。
 * 必須在 drop 事件內同步呼叫(事件結束後 DataTransfer 會被清空)。
 */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null);
  // 瀏覽器不支援 webkitGetAsEntry 時退回一般檔案清單
  if (!entries.length || entries.some((e) => !e)) return Array.from(dt.files);

  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File | null>((ok) => (entry as FileSystemFileEntry).file(ok, () => ok(null)));
      if (file) out.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries 每次最多回傳約 100 筆,要重複呼叫直到回傳空陣列
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok) => reader.readEntries(ok, () => ok([])));
        if (!batch.length) break;
        for (const child of batch) await walk(child);
      }
    }
  };
  for (const e of entries) await walk(e!);
  return out;
}

export function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
