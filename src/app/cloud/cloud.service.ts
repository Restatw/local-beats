import { Injectable, inject, signal } from '@angular/core';
import { ImportService, summarize } from '../import.service';
import { LibraryService } from '../library.service';
import { ImportResult } from '../models';
import { UiService } from '../ui.service';
import { CloudConfigService } from './cloud-config.service';
import { CloudEntry, CloudProvider } from './cloud-provider';
import { GoogleDriveProvider } from './google-drive.provider';
import { OneDriveProvider } from './onedrive.provider';

export interface CloudProgress {
  index: number;
  total: number;
  name: string;
  loaded: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class CloudService {
  private readonly lib = inject(LibraryService);
  private readonly importer = inject(ImportService);
  private readonly ui = inject(UiService);
  private readonly config = inject(CloudConfigService);

  readonly providers: CloudProvider[] = [inject(GoogleDriveProvider), inject(OneDriveProvider)];
  readonly isOpen = signal(false);
  readonly progress = signal<CloudProgress | null>(null);
  private abort?: AbortController;

  open(): void {
    void this.config.load();
    this.isOpen.set(true);
  }

  close(): void {
    if (this.progress()) return; // 匯入中不關閉,避免誤觸
    this.isOpen.set(false);
  }

  cancel(): void {
    this.abort?.abort();
  }

  /** 逐一下載並存進本機(每首下載完就寫入,不會把整批檔案放在記憶體) */
  async importEntries(provider: CloudProvider, entries: CloudEntry[]): Promise<void> {
    const ctrl = (this.abort = new AbortController());
    const total: ImportResult = { added: 0, duplicate: 0, unsupported: 0, failed: 0 };
    this.importer.busy.set(true);
    try {
      for (const [index, e] of entries.entries()) {
        if (ctrl.signal.aborted) break;
        this.progress.set({ index, total: entries.length, name: e.name, loaded: 0, size: e.size });
        if (this.lib.isKnown(e.name, e.size)) {
          total.duplicate++;
          continue;
        }
        try {
          const file = await provider.download(e, (loaded) => this.progress.update((p) => p && { ...p, loaded }), ctrl.signal);
          const r = await this.lib.addFiles([file]);
          total.added += r.added;
          total.duplicate += r.duplicate;
          total.unsupported += r.unsupported;
          total.failed += r.failed;
        } catch {
          if (!ctrl.signal.aborted) total.failed++;
        }
      }
    } finally {
      this.progress.set(null);
      this.importer.busy.set(false);
    }
    this.ui.toast(summarize(total) + (ctrl.signal.aborted ? '(已取消)' : ''));
  }
}
