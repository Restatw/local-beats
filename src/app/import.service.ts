import { Injectable, inject, signal } from '@angular/core';
import { LibraryService } from './library.service';
import { ImportResult } from './models';
import { UiService } from './ui.service';

export function summarize(r: ImportResult): string {
  const parts: string[] = [];
  if (r.added) parts.push(`已匯入 ${r.added} 首`);
  if (r.duplicate) parts.push(`${r.duplicate} 首已存在`);
  if (r.unsupported) parts.push(`${r.unsupported} 個不是音訊檔`);
  if (r.failed) parts.push(`${r.failed} 個無法讀取`);
  return parts.join('、') || '沒有可匯入的檔案';
}

@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly lib = inject(LibraryService);
  private readonly ui = inject(UiService);
  readonly busy = signal(false);

  async import(files: Iterable<File>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const r = await this.lib.addFiles(files);
      this.ui.toast(summarize(r));
    } finally {
      this.busy.set(false);
    }
  }
}
