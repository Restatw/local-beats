import { Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../icon';
import { LibraryService } from '../library.service';
import { PlayerService } from '../player.service';
import { TrackList } from '../track-list';
import { UploadButton } from '../upload-button';
import { formatTotal } from '../util';

type SortKey = 'recent' | 'title' | 'artist';

@Component({
  selector: 'app-library-page',
  imports: [TrackList, UploadButton, Icon],
  template: `
    <section class="page">
      <header class="page-head">
        <div>
          <h1>音樂庫</h1>
          <p class="muted" data-testid="library-summary">
            {{ lib.tracks().length }} 首歌曲 @if (lib.tracks().length) { · {{ total() }} }
          </p>
        </div>
      </header>

      @if (lib.tracks().length) {
        <div class="toolbar">
          <button type="button" class="play-btn" aria-label="播放全部" (click)="player.playList(ids())">
            <app-icon name="play" [size]="26" />
          </button>
          <button type="button" class="btn" (click)="player.playList(ids(), { shuffle: true })">
            <app-icon name="shuffle" [size]="18" /> 隨機播放
          </button>
          <span class="spacer"></span>
          <label class="sort">
            排序
            <select [value]="sort()" (change)="sort.set($any($event.target).value)">
              <option value="recent">最近加入</option>
              <option value="title">歌名</option>
              <option value="artist">演出者</option>
            </select>
          </label>
        </div>
        <app-track-list [tracks]="sorted()" />
      } @else {
        <div class="empty">
          <app-icon name="music" [size]="56" />
          <h2>還沒有音樂</h2>
          <p class="muted">上傳 mp3、m4a、wav、flac 等檔案或整個資料夾,或直接拖曳到視窗裡。<br />檔名為「演出者 - 歌名」時會自動辨識。</p>
          <app-upload-button />
        </div>
      }
    </section>
  `,
})
export class LibraryPage {
  protected readonly lib = inject(LibraryService);
  protected readonly player = inject(PlayerService);
  protected readonly sort = signal<SortKey>('recent');

  protected readonly sorted = computed(() => {
    const list = [...this.lib.tracks()];
    switch (this.sort()) {
      case 'title':
        return list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
      case 'artist':
        return list.sort((a, b) => a.artist.localeCompare(b.artist, 'zh-Hant') || a.title.localeCompare(b.title, 'zh-Hant'));
      default:
        return list.sort((a, b) => b.addedAt - a.addedAt);
    }
  });
  protected readonly ids = computed(() => this.sorted().map((t) => t.id));
  protected readonly total = computed(() => formatTotal(this.lib.tracks().reduce((s, t) => s + t.duration, 0)));
}
