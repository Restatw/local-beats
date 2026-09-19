import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../icon';
import { LibraryService } from '../library.service';
import { PlayerService } from '../player.service';
import { TrackList } from '../track-list';
import { UiService } from '../ui.service';
import { coverGradient, formatTotal } from '../util';

@Component({
  selector: 'app-playlist-page',
  imports: [TrackList, Icon, RouterLink],
  template: `
    @if (playlist(); as p) {
      <section class="page">
        <header class="page-head with-cover">
          <div class="cover hero" [style.background]="cover(p.id)"><app-icon name="playlist" [size]="64" /></div>
          <div>
            <p class="eyebrow">播放清單</p>
            <h1 data-testid="playlist-name">{{ p.name }}</h1>
            <p class="muted">{{ tracks().length }} 首歌曲 @if (tracks().length) { · {{ total() }} }</p>
          </div>
        </header>

        <div class="toolbar">
          @if (tracks().length) {
            <button type="button" class="play-btn" aria-label="播放全部" (click)="player.playList(ids())">
              <app-icon name="play" [size]="26" />
            </button>
            <button type="button" class="btn" (click)="player.playList(ids(), { shuffle: true })">
              <app-icon name="shuffle" [size]="18" /> 隨機播放
            </button>
          }
          <span class="spacer"></span>
          <button type="button" class="btn" (click)="rename()"><app-icon name="edit" [size]="18" /> 重新命名</button>
          <button type="button" class="btn btn-danger-outline" (click)="remove()">
            <app-icon name="trash" [size]="18" /> 刪除
          </button>
        </div>

        @if (tracks().length) {
          <app-track-list [tracks]="tracks()" [playlistId]="p.id" />
        } @else {
          <div class="empty">
            <h2>這個播放清單是空的</h2>
            <p class="muted">在音樂庫的歌曲上按「⋯」→「加入播放清單」即可加入。</p>
            <a class="btn" routerLink="/">前往音樂庫</a>
          </div>
        }
      </section>
    } @else {
      <section class="page">
        <div class="empty">
          <h2>找不到這個播放清單</h2>
          <a class="btn" routerLink="/">回到音樂庫</a>
        </div>
      </section>
    }
  `,
})
export class PlaylistPage {
  /** 路由參數 :id(withComponentInputBinding) */
  readonly id = input.required<string>();

  protected readonly lib = inject(LibraryService);
  protected readonly player = inject(PlayerService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  protected readonly cover = coverGradient;
  protected readonly playlist = computed(() => this.lib.playlists().find((p) => p.id === this.id()));
  protected readonly tracks = computed(() => {
    const p = this.playlist();
    return p ? this.lib.resolve(p.trackIds) : [];
  });
  protected readonly ids = computed(() => this.tracks().map((t) => t.id));
  protected readonly total = computed(() => formatTotal(this.tracks().reduce((s, t) => s + t.duration, 0)));

  protected async rename(): Promise<void> {
    const p = this.playlist();
    if (!p) return;
    const name = await this.ui.prompt('重新命名播放清單', p.name, '儲存');
    if (name) this.lib.renamePlaylist(p.id, name);
  }

  protected async remove(): Promise<void> {
    const p = this.playlist();
    if (!p) return;
    const ok = await this.ui.confirm('刪除播放清單?', `「${p.name}」會被刪除,但歌曲仍保留在音樂庫。`, '刪除', true);
    if (!ok) return;
    this.lib.deletePlaylist(p.id);
    void this.router.navigateByUrl('/');
  }
}
