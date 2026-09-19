import { Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { Icon } from '../icon';
import { formatSize } from '../util';
import { CloudEntry, ProviderId } from './cloud-provider';
import { CloudService } from './cloud.service';

interface Crumb {
  id: string | null;
  name: string;
}

function messageOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '發生錯誤,請稍後再試';
}

@Component({
  selector: 'app-cloud-dialog',
  imports: [Icon],
  template: `
    @if (cloud.isOpen()) {
      <div class="modal-backdrop" (click)="cloud.close()">
        <section class="modal cloud" role="dialog" aria-modal="true" aria-label="從雲端匯入" (click)="$event.stopPropagation()">
          <header class="cloud-head">
            <h2>從雲端匯入</h2>
            <button type="button" class="icon-btn" aria-label="關閉" [disabled]="!!cloud.progress()" (click)="cloud.close()">
              <app-icon name="close" [size]="22" />
            </button>
          </header>

          <div class="tabs" role="tablist">
            @for (p of cloud.providers; track p.id) {
              <button type="button" role="tab" [attr.aria-selected]="p.id === active()" [disabled]="!!cloud.progress()" (click)="switchTo(p.id)">
                {{ p.label }}
              </button>
            }
          </div>

          @let p = provider();
          @if (!p.configured()) {
            <div class="cloud-note" data-testid="cloud-unconfigured">
              尚未設定 {{ p.label }} 的 Client ID。請編輯 <code>cloud-config.json</code>
              ({{ p.id === 'gdrive' ? 'googleClientId' : 'microsoftClientId' }}),設定方式見 README。
            </div>
          } @else if (!p.connected()) {
            <div class="empty">
              <app-icon name="cloud" [size]="48" />
              <p class="muted">登入後可瀏覽你的檔案並挑選音樂匯入。只會要求「唯讀」權限,登入資訊不會被儲存。</p>
              <button type="button" class="btn btn-primary" data-testid="cloud-login" (click)="connect()">登入 {{ p.label }}</button>
              @if (error()) {
                <p class="cloud-error" role="alert">{{ error() }}</p>
              }
            </div>
          } @else {
            <nav class="crumbs" aria-label="路徑">
              @for (c of path(); track $index; let last = $last) {
                <button type="button" [disabled]="last || !!cloud.progress()" (click)="goTo($index)">{{ c.name }}</button>
                @if (!last) {
                  <span aria-hidden="true">›</span>
                }
              }
              <span class="spacer"></span>
              <button type="button" class="link" [disabled]="!!cloud.progress()" (click)="disconnect()">登出</button>
            </nav>

            <div class="cloud-list" data-testid="cloud-list">
              @for (e of entries(); track e.id) {
                @if (e.folder) {
                  <button type="button" class="cloud-row" data-testid="cloud-folder" [disabled]="!!cloud.progress()" (click)="enter(e)">
                    <app-icon name="folder" [size]="22" /> <span class="name">{{ e.name }}</span> <span class="muted">›</span>
                  </button>
                } @else {
                  <label class="cloud-row" data-testid="cloud-entry">
                    <input type="checkbox" [checked]="selected().has(e.id)" [disabled]="!!cloud.progress()" (change)="toggle(e)" />
                    <app-icon name="music" [size]="20" /> <span class="name">{{ e.name }}</span>
                    <small class="muted">{{ size(e.size) }}</small>
                  </label>
                }
              }
              @if (loading()) {
                <div class="menu-empty">載入中…</div>
              } @else if (!entries().length && !error()) {
                <div class="menu-empty">這個資料夾裡沒有音樂或子資料夾</div>
              }
              @if (next() && !loading()) {
                <button type="button" class="btn load-more" (click)="loadMore()">載入更多</button>
              }
              @if (error()) {
                <p class="cloud-error" role="alert">{{ error() }}</p>
              }
            </div>

            <footer class="cloud-foot">
              @if (cloud.progress(); as pr) {
                <div class="progress-wrap" data-testid="cloud-progress">
                  <div class="progress-text">
                    <span>下載中 {{ pr.index + 1 }} / {{ pr.total }}:{{ pr.name }}</span>
                    <span>{{ size(pr.loaded) }}{{ pr.size ? ' / ' + size(pr.size) : '' }}</span>
                  </div>
                  <progress [max]="pr.size || 1" [value]="pr.size ? pr.loaded : 0"></progress>
                </div>
                <button type="button" class="btn" (click)="cloud.cancel()">取消</button>
              } @else {
                <button type="button" class="btn" [disabled]="!audioHere().length" (click)="toggleAll()">
                  {{ allSelected() ? '取消全選' : '全選本頁' }}
                </button>
                <span class="muted" data-testid="cloud-selected">已選 {{ selected().size }} 首</span>
                <span class="spacer"></span>
                <button type="button" class="btn btn-primary" data-testid="cloud-import" [disabled]="!selected().size" (click)="importSelected()">
                  匯入到本機
                </button>
              }
            </footer>
          }
        </section>
      </div>
    }
  `,
})
export class CloudDialog {
  protected readonly cloud = inject(CloudService);

  protected readonly active = signal<ProviderId>('gdrive');
  protected readonly provider = computed(() => this.cloud.providers.find((p) => p.id === this.active())!);
  protected readonly path = signal<Crumb[]>([]);
  protected readonly entries = signal<CloudEntry[]>([]);
  protected readonly next = signal<string | undefined>(undefined);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly selected = signal<ReadonlyMap<string, CloudEntry>>(new Map());
  protected readonly audioHere = computed(() => this.entries().filter((e) => !e.folder));
  protected readonly allSelected = computed(() => this.audioHere().length > 0 && this.audioHere().every((e) => this.selected().has(e.id)));
  protected readonly size = formatSize;
  private seq = 0;

  constructor() {
    effect(() => {
      if (this.cloud.isOpen()) untracked(() => this.reset());
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.cloud.isOpen()) this.cloud.close();
  }

  protected switchTo(id: ProviderId): void {
    this.active.set(id);
    this.reset();
  }

  protected async connect(): Promise<void> {
    this.error.set('');
    try {
      await this.provider().connect();
      await this.browse([{ id: null, name: this.provider().rootName }]);
    } catch (e) {
      this.error.set(messageOf(e));
    }
  }

  protected disconnect(): void {
    this.provider().disconnect();
    this.reset();
  }

  protected enter(folder: CloudEntry): Promise<void> {
    return this.browse([...this.path(), { id: folder.id, name: folder.name }]);
  }

  protected goTo(index: number): Promise<void> {
    return this.browse(this.path().slice(0, index + 1));
  }

  protected loadMore(): Promise<void> {
    return this.fetchPage();
  }

  protected toggle(e: CloudEntry): void {
    this.selected.update((m) => {
      const copy = new Map(m);
      if (!copy.delete(e.id)) copy.set(e.id, e);
      return copy;
    });
  }

  protected toggleAll(): void {
    const all = this.allSelected();
    this.selected.update((m) => {
      const copy = new Map(m);
      for (const e of this.audioHere()) all ? copy.delete(e.id) : copy.set(e.id, e);
      return copy;
    });
  }

  protected async importSelected(): Promise<void> {
    const list = [...this.selected().values()];
    await this.cloud.importEntries(this.provider(), list);
    this.selected.set(new Map());
    if (!this.cloud.progress()) this.cloud.isOpen.set(false);
  }

  private reset(): void {
    this.seq++;
    this.error.set('');
    this.entries.set([]);
    this.next.set(undefined);
    this.selected.set(new Map());
    this.path.set([]);
    if (this.provider().connected()) void this.browse([{ id: null, name: this.provider().rootName }]);
  }

  private async browse(path: Crumb[]): Promise<void> {
    this.path.set(path);
    this.entries.set([]);
    this.next.set(undefined);
    await this.fetchPage(true);
  }

  private async fetchPage(first = false): Promise<void> {
    const seq = first ? ++this.seq : this.seq;
    const folder = this.path().at(-1)?.id ?? null;
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.provider().list(folder, first ? undefined : this.next());
      if (seq !== this.seq) return; // 已切換資料夾或來源
      this.entries.update((l) => [...l, ...page.entries]);
      this.next.set(page.next);
    } catch (e) {
      if (seq === this.seq) this.error.set(messageOf(e));
    } finally {
      if (seq === this.seq) this.loading.set(false);
    }
  }
}
