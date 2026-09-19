import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Icon } from './icon';
import { LibraryService } from './library.service';
import { Playlist } from './models';
import { UiService } from './ui.service';
import { UploadButton } from './upload-button';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon, UploadButton],
  template: `
    <aside class="sidebar" [class.open]="ui.sidebarOpen()" aria-label="主選單">
      <div class="brand">
        <app-icon name="music" [size]="26" />
        <span>LocalBeats</span>
        <button type="button" class="icon-btn close-btn" aria-label="關閉選單" (click)="close()">
          <app-icon name="close" [size]="22" />
        </button>
      </div>

      <nav class="card nav">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="close()">
          <app-icon name="library" [size]="24" /> 音樂庫
        </a>
        <a routerLink="/search" routerLinkActive="active" (click)="close()">
          <app-icon name="search" [size]="24" /> 搜尋
        </a>
        <a routerLink="/liked" routerLinkActive="active" (click)="close()">
          <app-icon name="heart" [size]="24" /> 已按讚的歌曲
          <small class="count">{{ lib.likedIds().length }}</small>
        </a>
      </nav>

      <section class="card playlists" aria-label="播放清單">
        <div class="section-head">
          <span>播放清單</span>
          <button type="button" class="icon-btn" aria-label="新增播放清單" data-testid="new-playlist" (click)="create()">
            <app-icon name="plus" [size]="22" />
          </button>
        </div>
        <ul>
          @for (p of lib.playlists(); track p.id) {
            <li>
              <a [routerLink]="['/playlist', p.id]" routerLinkActive="active" (click)="close()">
                <app-icon name="playlist" [size]="20" />
                <span class="name">{{ p.name }}</span>
                <small class="count">{{ p.trackIds.length }}</small>
              </a>
              <button type="button" class="icon-btn item-action" [attr.aria-label]="'重新命名 ' + p.name" (click)="rename(p)">
                <app-icon name="edit" [size]="16" />
              </button>
              <button type="button" class="icon-btn item-action" [attr.aria-label]="'刪除 ' + p.name" (click)="remove(p)">
                <app-icon name="trash" [size]="16" />
              </button>
            </li>
          } @empty {
            <li class="menu-empty">按 ＋ 建立第一個播放清單</li>
          }
        </ul>
      </section>

      <app-upload-button />
    </aside>
    <div class="scrim" [class.show]="ui.sidebarOpen()" (click)="close()"></div>
  `,
  host: { style: 'display: contents' },
})
export class Sidebar {
  protected readonly lib = inject(LibraryService);
  protected readonly ui = inject(UiService);
  private readonly router = inject(Router);

  protected close(): void {
    this.ui.sidebarOpen.set(false);
  }

  protected async create(): Promise<void> {
    const name = await this.ui.prompt('新增播放清單', `我的播放清單 #${this.lib.playlists().length + 1}`, '建立');
    if (!name) return;
    const p = this.lib.createPlaylist(name);
    this.close();
    void this.router.navigate(['/playlist', p.id]);
  }

  protected async rename(p: Playlist): Promise<void> {
    const name = await this.ui.prompt('重新命名播放清單', p.name, '儲存');
    if (name) this.lib.renamePlaylist(p.id, name);
  }

  protected async remove(p: Playlist): Promise<void> {
    const ok = await this.ui.confirm('刪除播放清單?', `「${p.name}」會被刪除,但歌曲仍保留在音樂庫。`, '刪除', true);
    if (!ok) return;
    this.lib.deletePlaylist(p.id);
    if (this.router.url === `/playlist/${p.id}`) void this.router.navigateByUrl('/');
  }
}
