import { Component, computed, inject } from '@angular/core';
import { Icon } from './icon';
import { LibraryService } from './library.service';
import { PlayerService } from './player.service';
import { coverGradient, formatTime } from './util';

@Component({
  selector: 'app-player-bar',
  imports: [Icon],
  template: `
    <footer class="player" aria-label="播放器">
      <div class="now">
        @if (player.current(); as t) {
          <div class="cover big" [style.background]="cover(t.id)"><app-icon name="music" [size]="24" /></div>
          <div class="meta">
            <div class="title" data-testid="now-title">{{ t.title }}</div>
            <div class="artist" data-testid="now-artist">{{ t.artist }}</div>
          </div>
          <button
            type="button"
            class="icon-btn like"
            [class.on]="lib.likedSet().has(t.id)"
            [attr.aria-label]="lib.likedSet().has(t.id) ? '取消按讚' : '按讚'"
            (click)="lib.toggleLike(t.id)"
          >
            <app-icon [name]="lib.likedSet().has(t.id) ? 'heart' : 'heart-outline'" [size]="22" />
          </button>
        } @else {
          <div class="muted">選擇一首歌開始播放</div>
        }
      </div>

      <div class="center">
        <div class="controls">
          <button
            type="button"
            class="icon-btn"
            [class.on]="player.shuffle()"
            aria-label="隨機播放"
            [attr.aria-pressed]="player.shuffle()"
            (click)="player.toggleShuffle()"
          >
            <app-icon name="shuffle" [size]="22" />
          </button>
          <button type="button" class="icon-btn" aria-label="上一首" (click)="player.previous()">
            <app-icon name="prev" [size]="28" />
          </button>
          <button
            type="button"
            class="play-btn"
            data-testid="play-toggle"
            [attr.aria-label]="player.playing() ? '暫停' : '播放'"
            (click)="player.toggle()"
          >
            <app-icon [name]="player.playing() ? 'pause' : 'play'" [size]="26" />
          </button>
          <button type="button" class="icon-btn" aria-label="下一首" (click)="player.next()">
            <app-icon name="next" [size]="28" />
          </button>
          <button
            type="button"
            class="icon-btn repeat"
            [class.on]="player.repeat() !== 'off'"
            [attr.aria-label]="'重複播放:' + repeatLabel()"
            (click)="player.cycleRepeat()"
          >
            <app-icon name="repeat" [size]="22" />
            @if (player.repeat() === 'one') {
              <span class="badge">1</span>
            }
          </button>
        </div>
        <div class="seek">
          <span class="time" data-testid="time-current">{{ fmt(player.currentTime()) }}</span>
          <input
            type="range"
            class="slider"
            aria-label="播放進度"
            min="0"
            step="0.1"
            [max]="player.duration() || 0"
            [value]="player.currentTime()"
            [disabled]="!player.current()"
            [style.--pct]="seekPct() + '%'"
            (input)="player.seek(+$any($event.target).value)"
          />
          <span class="time">{{ fmt(player.duration()) }}</span>
        </div>
      </div>

      <div class="volume">
        <button
          type="button"
          class="icon-btn"
          [attr.aria-label]="player.muted() || player.volume() === 0 ? '取消靜音' : '靜音'"
          (click)="player.toggleMute()"
        >
          <app-icon [name]="player.muted() || player.volume() === 0 ? 'volume-mute' : 'volume'" [size]="22" />
        </button>
        <input
          type="range"
          class="slider"
          aria-label="音量"
          min="0"
          max="1"
          step="0.01"
          [value]="player.muted() ? 0 : player.volume()"
          [style.--pct]="(player.muted() ? 0 : player.volume() * 100) + '%'"
          (input)="player.setVolume(+$any($event.target).value)"
        />
      </div>
    </footer>
  `,
  host: { style: 'display: contents' },
})
export class PlayerBar {
  protected readonly player = inject(PlayerService);
  protected readonly lib = inject(LibraryService);
  protected readonly cover = coverGradient;
  protected readonly fmt = formatTime;

  protected readonly seekPct = computed(() => {
    const d = this.player.duration();
    return d > 0 ? Math.min(100, (this.player.currentTime() / d) * 100) : 0;
  });

  protected repeatLabel(): string {
    return { off: '關閉', all: '全部', one: '單曲' }[this.player.repeat()];
  }
}
