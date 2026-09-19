import { Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon';
import { LibraryService } from '../library.service';
import { TrackList } from '../track-list';
import { normalize } from '../util';

@Component({
  selector: 'app-search-page',
  imports: [TrackList, RouterLink, Icon],
  template: `
    <section class="page">
      <div class="search-box">
        <app-icon name="search" [size]="22" />
        <input
          #box
          type="search"
          class="search-input"
          placeholder="搜尋歌名、演出者或播放清單"
          aria-label="搜尋"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
        @if (query()) {
          <button type="button" class="icon-btn" aria-label="清除搜尋" (click)="clear(box)">
            <app-icon name="close" [size]="20" />
          </button>
        }
      </div>

      @if (!q()) {
        <div class="empty">
          <app-icon name="search" [size]="56" />
          <h2>搜尋你的音樂庫</h2>
          <p class="muted">共 {{ lib.tracks().length }} 首歌曲、{{ lib.playlists().length }} 個播放清單</p>
        </div>
      } @else {
        @if (playlists().length) {
          <h2 class="section-title">播放清單</h2>
          <div class="chips">
            @for (p of playlists(); track p.id) {
              <a class="chip" [routerLink]="['/playlist', p.id]"><app-icon name="playlist" [size]="18" /> {{ p.name }}</a>
            }
          </div>
        }
        <h2 class="section-title">歌曲 <small class="muted" data-testid="result-count">{{ tracks().length }}</small></h2>
        @if (tracks().length) {
          <app-track-list [tracks]="tracks()" />
        } @else {
          <p class="muted" data-testid="no-results">找不到「{{ query().trim() }}」的相關結果</p>
        }
      }
    </section>
  `,
})
export class SearchPage {
  protected readonly lib = inject(LibraryService);
  protected readonly query = signal('');
  protected readonly q = computed(() => normalize(this.query()));
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  protected readonly tracks = computed(() => {
    const q = this.q();
    return q ? this.lib.tracks().filter((t) => normalize(`${t.title} ${t.artist}`).includes(q)) : [];
  });
  protected readonly playlists = computed(() => {
    const q = this.q();
    return q ? this.lib.playlists().filter((p) => normalize(p.name).includes(q)) : [];
  });

  constructor() {
    afterNextRender(() => this.box().nativeElement.focus());
  }

  protected clear(box: HTMLInputElement): void {
    this.query.set('');
    box.focus();
  }
}
