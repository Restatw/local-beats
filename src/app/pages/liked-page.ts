import { Component, computed, inject } from '@angular/core';
import { Icon } from '../icon';
import { LibraryService } from '../library.service';
import { PlayerService } from '../player.service';
import { TrackList } from '../track-list';

@Component({
  selector: 'app-liked-page',
  imports: [TrackList, Icon],
  template: `
    <section class="page">
      <header class="page-head with-cover">
        <div class="cover hero liked"><app-icon name="heart" [size]="64" /></div>
        <div>
          <p class="eyebrow">播放清單</p>
          <h1>已按讚的歌曲</h1>
          <p class="muted">{{ lib.likedTracks().length }} 首歌曲</p>
        </div>
      </header>

      @if (lib.likedTracks().length) {
        <div class="toolbar">
          <button type="button" class="play-btn" aria-label="播放全部" (click)="player.playList(ids())">
            <app-icon name="play" [size]="26" />
          </button>
          <button type="button" class="btn" (click)="player.playList(ids(), { shuffle: true })">
            <app-icon name="shuffle" [size]="18" /> 隨機播放
          </button>
        </div>
        <app-track-list [tracks]="lib.likedTracks()" />
      } @else {
        <div class="empty">
          <h2>還沒有按讚的歌曲</h2>
          <p class="muted">按下歌曲旁邊的愛心,就會收藏在這裡。</p>
        </div>
      }
    </section>
  `,
})
export class LikedPage {
  protected readonly lib = inject(LibraryService);
  protected readonly player = inject(PlayerService);
  protected readonly ids = computed(() => this.lib.likedTracks().map((t) => t.id));
}
