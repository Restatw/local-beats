import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { LibraryService } from './library.service';
import { StorageService } from './storage.service';
import { UiService } from './ui.service';

export type RepeatMode = 'off' | 'all' | 'one';

interface LastSession {
  id: string;
  queue: string[];
}

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly lib = inject(LibraryService);
  private readonly storage = inject(StorageService);
  private readonly ui = inject(UiService);

  private readonly audio = new Audio();
  private objectUrl: string | null = null;
  private loadSeq = 0;

  readonly queue = signal<string[]>([]);
  readonly currentId = signal<string | null>(null);
  readonly playing = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly volume = signal<number>(this.storage.load('lb.volume', 0.8));
  readonly muted = signal(false);
  readonly shuffle = signal<boolean>(this.storage.load('lb.shuffle', false));
  readonly repeat = signal<RepeatMode>(this.storage.load('lb.repeat', 'off'));

  readonly current = computed(() => {
    const id = this.currentId();
    return id ? (this.lib.trackMap().get(id) ?? null) : null;
  });

  constructor() {
    const a = this.audio;
    a.volume = this.volume();
    a.addEventListener('play', () => this.playing.set(true));
    a.addEventListener('pause', () => this.playing.set(false));
    a.addEventListener('timeupdate', () => this.currentTime.set(a.currentTime));
    a.addEventListener('durationchange', () => this.duration.set(Number.isFinite(a.duration) ? a.duration : 0));
    a.addEventListener('ended', () => this.onEnded());
    a.addEventListener('error', () => {
      if (a.getAttribute('src')) this.ui.toast('無法播放這個檔案');
      this.playing.set(false);
    });

    effect(() => {
      a.volume = this.volume();
      a.muted = this.muted();
    });
    effect(() => this.storage.save('lb.volume', this.volume()));
    effect(() => this.storage.save('lb.shuffle', this.shuffle()));
    effect(() => this.storage.save('lb.repeat', this.repeat()));

    // 曲目被刪除時,從佇列移除;正在播放的就停止
    effect(() => {
      const map = this.lib.trackMap();
      untracked(() => {
        this.queue.update((q) => (q.every((id) => map.has(id)) ? q : q.filter((id) => map.has(id))));
        const id = this.currentId();
        if (id && !map.has(id)) this.stop();
      });
    });

    effect(() => {
      const id = this.currentId();
      if (id) this.storage.save('lb.last', { id, queue: this.queue() } satisfies LastSession);
    });

    this.setupMediaSession();

    // 還原上次播放的歌曲(不自動播放)
    const last = this.storage.load<LastSession | null>('lb.last', null);
    if (last && this.lib.trackMap().has(last.id)) {
      this.queue.set(last.queue.filter((id) => this.lib.trackMap().has(id)));
      void this.load(last.id, false);
    }
  }

  /** 播放指定歌曲;點選正在播放的歌曲則切換播放/暫停 */
  playTrack(id: string, queue?: string[]): void {
    if (queue) this.queue.set(queue.includes(id) ? queue : [id, ...queue]);
    else if (!this.queue().includes(id)) this.queue.set([id]);

    if (id === this.currentId() && this.audio.getAttribute('src')) {
      this.toggle();
      return;
    }
    void this.load(id, true);
  }

  playList(ids: string[], opts: { shuffle?: boolean } = {}): void {
    if (!ids.length) return;
    if (opts.shuffle) this.shuffle.set(true);
    const start = opts.shuffle ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
    this.queue.set(ids);
    void this.load(start, true);
  }

  toggle(): void {
    if (!this.currentId()) {
      const ids = this.lib.tracks().map((t) => t.id);
      if (ids.length) this.playList(ids);
      return;
    }
    if (this.audio.paused) this.audio.play().catch(() => undefined);
    else this.audio.pause();
  }

  next(fromEnded = false): void {
    const q = this.queue();
    if (!q.length) return;
    const i = q.indexOf(this.currentId() ?? '');
    let n: number;
    if (this.shuffle() && q.length > 1) {
      do n = Math.floor(Math.random() * q.length);
      while (n === i);
    } else {
      n = i + 1;
      if (n >= q.length) {
        if (fromEnded && this.repeat() === 'off') {
          this.audio.pause();
          this.seek(0);
          return;
        }
        n = 0;
      }
    }
    void this.load(q[n], true);
  }

  previous(): void {
    const q = this.queue();
    if (!q.length) return;
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }
    const i = q.indexOf(this.currentId() ?? '');
    void this.load(q[i <= 0 ? q.length - 1 : i - 1], true);
  }

  seek(seconds: number): void {
    this.audio.currentTime = seconds;
    this.currentTime.set(seconds);
  }

  setVolume(v: number): void {
    this.volume.set(v);
    this.muted.set(v === 0);
  }

  toggleMute(): void {
    this.muted.update((m) => !m);
  }

  toggleShuffle(): void {
    this.shuffle.update((s) => !s);
  }

  cycleRepeat(): void {
    this.repeat.update((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  }

  private onEnded(): void {
    if (this.repeat() === 'one') {
      this.seek(0);
      this.audio.play().catch(() => undefined);
    } else {
      this.next(true);
    }
  }

  private stop(): void {
    this.loadSeq++;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.revoke();
    this.currentId.set(null);
    this.currentTime.set(0);
    this.duration.set(0);
    this.playing.set(false);
  }

  private revoke(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  private async load(id: string, autoplay: boolean): Promise<void> {
    const seq = ++this.loadSeq;
    const blob = await this.storage.getBlob(id).catch(() => undefined);
    if (seq !== this.loadSeq) return; // 已經切到別首
    if (!blob) {
      this.ui.toast('找不到這首歌的檔案');
      return;
    }
    this.revoke();
    this.objectUrl = URL.createObjectURL(blob);
    this.audio.src = this.objectUrl;
    this.currentId.set(id);
    this.currentTime.set(0);
    this.updateMediaSession();
    if (autoplay) await this.audio.play().catch(() => undefined);
  }

  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => this.audio.play().catch(() => undefined));
    ms.setActionHandler('pause', () => this.audio.pause());
    ms.setActionHandler('previoustrack', () => this.previous());
    ms.setActionHandler('nexttrack', () => this.next());
    ms.setActionHandler('seekto', (d) => d.seekTime !== undefined && this.seek(d.seekTime));
  }

  private updateMediaSession(): void {
    const track = this.current();
    if (!('mediaSession' in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: 'LocalBeats' });
  }
}
