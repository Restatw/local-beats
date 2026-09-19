import { Component, DestroyRef, HostListener, computed, inject, input, signal } from '@angular/core';
import { Icon } from './icon';
import { LibraryService } from './library.service';
import { Track } from './models';
import { PlayerService } from './player.service';
import { UiService } from './ui.service';
import { coverGradient, formatTime } from './util';

interface MenuState {
  trackId: string;
  view: 'main' | 'playlists';
  x: number;
  y: number;
}

const MENU_W = 240;
const MENU_H = 280;

@Component({
  selector: 'app-track-list',
  imports: [Icon],
  template: `
    <div class="track-head" aria-hidden="true">
      <span>#</span><span>標題</span><span></span><span class="dur">時間</span><span></span>
    </div>
    @for (t of tracks(); track t.id; let i = $index) {
      <div class="track-row" [class.active]="player.currentId() === t.id" data-testid="track-row" (click)="play(t)">
        <button
          type="button"
          class="track-idx"
          [attr.aria-label]="(player.currentId() === t.id && player.playing() ? '暫停 ' : '播放 ') + t.title"
          (click)="$event.stopPropagation(); play(t)"
        >
          @if (player.currentId() === t.id && player.playing()) {
            <span class="eq"><i></i><i></i><i></i></span>
          } @else {
            <span class="num">{{ i + 1 }}</span>
            <app-icon class="hover-play" name="play" [size]="18" />
          }
        </button>
        <div class="track-main">
          <div class="cover" [style.background]="cover(t.id)"><app-icon name="music" [size]="18" /></div>
          <div class="meta">
            <div class="title" data-testid="track-title">{{ t.title }}</div>
            <div class="artist">{{ t.artist }}</div>
          </div>
        </div>
        <button
          type="button"
          class="icon-btn like"
          [class.on]="lib.likedSet().has(t.id)"
          [attr.aria-label]="lib.likedSet().has(t.id) ? '取消按讚' : '按讚'"
          [attr.aria-pressed]="lib.likedSet().has(t.id)"
          (click)="$event.stopPropagation(); lib.toggleLike(t.id)"
        >
          <app-icon [name]="lib.likedSet().has(t.id) ? 'heart' : 'heart-outline'" [size]="20" />
        </button>
        <span class="dur">{{ fmt(t.duration) }}</span>
        <button
          type="button"
          class="icon-btn"
          aria-label="更多選項"
          aria-haspopup="menu"
          (click)="openMenu($event, t)"
        >
          <app-icon name="more" [size]="22" />
        </button>
      </div>
    }

    @if (menu(); as m) {
      <div class="ctx-menu" role="menu" [style.left.px]="m.x" [style.top.px]="m.y" (click)="$event.stopPropagation()">
        @if (m.view === 'main') {
          <button type="button" role="menuitem" (click)="menuPlay(m)"><app-icon name="play" [size]="18" /> 播放</button>
          <button type="button" role="menuitem" (click)="menuLike(m)">
            <app-icon [name]="lib.likedSet().has(m.trackId) ? 'heart' : 'heart-outline'" [size]="18" />
            {{ lib.likedSet().has(m.trackId) ? '取消按讚' : '按讚' }}
          </button>
          <button type="button" role="menuitem" (click)="setView('playlists')">
            <app-icon name="playlist" [size]="18" /> 加入播放清單
          </button>
          @if (playlistId()) {
            <button type="button" role="menuitem" (click)="menuRemoveFromPlaylist(m)">
              <app-icon name="close" [size]="18" /> 從此播放清單移除
            </button>
          }
          <hr />
          <button type="button" role="menuitem" class="danger" (click)="menuDelete(m)">
            <app-icon name="trash" [size]="18" /> 從音樂庫刪除
          </button>
        } @else {
          <button type="button" role="menuitem" (click)="setView('main')"><app-icon name="back" [size]="18" /> 返回</button>
          <button type="button" role="menuitem" (click)="menuNewPlaylist(m)">
            <app-icon name="plus" [size]="18" /> 新增播放清單…
          </button>
          <hr />
          <div class="menu-scroll">
            @for (p of lib.playlists(); track p.id) {
              <button type="button" role="menuitem" (click)="menuAddTo(m, p.id, p.name)">
                <span class="grow">{{ p.name }}</span>
                @if (p.trackIds.includes(m.trackId)) {
                  <app-icon name="check" [size]="18" />
                }
              </button>
            } @empty {
              <div class="menu-empty">還沒有播放清單</div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class TrackList {
  protected readonly lib = inject(LibraryService);
  protected readonly player = inject(PlayerService);
  private readonly ui = inject(UiService);

  readonly tracks = input.required<Track[]>();
  /** 在播放清單頁面時傳入,選單會多一個「從此播放清單移除」 */
  readonly playlistId = input<string | null>(null);

  protected readonly menu = signal<MenuState | null>(null);
  private readonly ids = computed(() => this.tracks().map((t) => t.id));

  constructor() {
    // 捲動時選單位置會錯位,直接關閉
    const close = () => this.menu.set(null);
    document.addEventListener('scroll', close, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', close, true));
  }

  protected cover = coverGradient;
  protected fmt = formatTime;

  protected play(t: Track): void {
    this.player.playTrack(t.id, this.ids());
  }

  protected openMenu(event: MouseEvent, t: Track): void {
    event.stopPropagation();
    if (this.menu()?.trackId === t.id) return this.menu.set(null);
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - 8));
    const y = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - MENU_H - 8));
    this.menu.set({ trackId: t.id, view: 'main', x, y });
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  @HostListener('window:resize')
  protected closeMenu(): void {
    this.menu.set(null);
  }

  protected setView(view: MenuState['view']): void {
    this.menu.update((m) => (m ? { ...m, view } : m));
  }

  protected menuPlay(m: MenuState): void {
    this.player.playTrack(m.trackId, this.ids());
    this.menu.set(null);
  }

  protected menuLike(m: MenuState): void {
    this.lib.toggleLike(m.trackId);
    this.menu.set(null);
  }

  protected menuAddTo(m: MenuState, playlistId: string, name: string): void {
    const added = this.lib.addToPlaylist(playlistId, m.trackId);
    this.ui.toast(added ? `已加入「${name}」` : `「${name}」中已有這首歌`);
    this.menu.set(null);
  }

  protected async menuNewPlaylist(m: MenuState): Promise<void> {
    this.menu.set(null);
    const name = await this.ui.prompt('新增播放清單', `我的播放清單 #${this.lib.playlists().length + 1}`, '建立');
    if (!name) return;
    const p = this.lib.createPlaylist(name);
    this.lib.addToPlaylist(p.id, m.trackId);
    this.ui.toast(`已加入「${p.name}」`);
  }

  protected menuRemoveFromPlaylist(m: MenuState): void {
    const pid = this.playlistId();
    if (pid) this.lib.removeFromPlaylist(pid, m.trackId);
    this.menu.set(null);
  }

  protected async menuDelete(m: MenuState): Promise<void> {
    this.menu.set(null);
    const t = this.lib.trackMap().get(m.trackId);
    if (!t) return;
    const ok = await this.ui.confirm('從音樂庫刪除?', `「${t.title}」會從裝置中永久移除。`, '刪除', true);
    if (ok) await this.lib.removeTrack(t.id);
  }
}
