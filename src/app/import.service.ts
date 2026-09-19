import { Injectable, inject, signal } from '@angular/core';
import { LibraryService } from './library.service';
import { UiService } from './ui.service';

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
      const parts: string[] = [];
      if (r.added) parts.push(`已匯入 ${r.added} 首`);
      if (r.duplicate) parts.push(`${r.duplicate} 首已存在`);
      if (r.unsupported) parts.push(`${r.unsupported} 個不是音訊檔`);
      if (r.failed) parts.push(`${r.failed} 個無法讀取`);
      this.ui.toast(parts.join('、') || '沒有可匯入的檔案');
    } finally {
      this.busy.set(false);
    }
  }
}
