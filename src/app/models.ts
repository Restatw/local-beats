export interface Track {
  id: string;
  title: string;
  artist: string;
  /** 秒數,無法讀取時為 0 */
  duration: number;
  size: number;
  mime: string;
  addedAt: number;
  /** 檔名 + 大小,用來避免重複匯入 */
  fileKey: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export interface ImportResult {
  added: number;
  duplicate: number;
  unsupported: number;
  failed: number;
}
