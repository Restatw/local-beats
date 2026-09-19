import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ImportResult, Playlist, Track } from './models';
import { StorageService } from './storage.service';
import { newId, parseFileName } from './util';

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i;

/** 讀取音檔長度;檔案無法解碼回傳 null */
function readDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      clearTimeout(timer);
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(0), 8000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly storage = inject(StorageService);

  readonly tracks = signal<Track[]>(this.storage.load('lb.tracks', []));
  readonly playlists = signal<Playlist[]>(this.storage.load('lb.playlists', []));
  /** 最近按讚的排在最前面 */
  readonly likedIds = signal<string[]>(this.storage.load('lb.liked', []));

  readonly trackMap = computed(() => new Map(this.tracks().map((t) => [t.id, t])));
  readonly likedSet = computed(() => new Set(this.likedIds()));
  readonly likedTracks = computed(() => this.resolve(this.likedIds()));

  constructor() {
    effect(() => this.storage.save('lb.tracks', this.tracks()));
    effect(() => this.storage.save('lb.playlists', this.playlists()));
    effect(() => this.storage.save('lb.liked', this.likedIds()));
  }

  resolve(ids: string[]): Track[] {
    const map = this.trackMap();
    return ids.flatMap((id) => map.get(id) ?? []);
  }

  async addFiles(files: Iterable<File>): Promise<ImportResult> {
    const result: ImportResult = { added: 0, duplicate: 0, unsupported: 0, failed: 0 };
    const known = new Set(this.tracks().map((t) => t.fileKey));

    for (const file of files) {
      if (!file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name)) {
        result.unsupported++;
        continue;
      }
      const fileKey = `${file.name}:${file.size}`;
      if (known.has(fileKey)) {
        result.duplicate++;
        continue;
      }
      try {
        const duration = await readDuration(file);
        if (duration === null) {
          result.failed++;
          continue;
        }
        const id = newId();
        await this.storage.putBlob(id, file);
        known.add(fileKey);
        const { title, artist } = parseFileName(file.name);
        this.tracks.update((list) => [
          ...list,
          { id, title, artist, duration, size: file.size, mime: file.type, addedAt: Date.now(), fileKey },
        ]);
        result.added++;
      } catch {
        result.failed++;
      }
    }
    if (result.added) void this.storage.requestPersistence();
    return result;
  }

  async removeTrack(id: string): Promise<void> {
    await this.storage.deleteBlob(id).catch(() => undefined);
    this.tracks.update((l) => l.filter((t) => t.id !== id));
    this.likedIds.update((l) => l.filter((x) => x !== id));
    this.playlists.update((l) => l.map((p) => ({ ...p, trackIds: p.trackIds.filter((x) => x !== id) })));
  }

  toggleLike(id: string): void {
    this.likedIds.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [id, ...l]));
  }

  createPlaylist(name: string): Playlist {
    const playlist: Playlist = { id: newId(), name: name.trim(), trackIds: [], createdAt: Date.now() };
    this.playlists.update((l) => [...l, playlist]);
    return playlist;
  }

  renamePlaylist(id: string, name: string): void {
    this.playlists.update((l) => l.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)));
  }

  deletePlaylist(id: string): void {
    this.playlists.update((l) => l.filter((p) => p.id !== id));
  }

  /** 已存在時回傳 false */
  addToPlaylist(playlistId: string, trackId: string): boolean {
    const playlist = this.playlists().find((p) => p.id === playlistId);
    if (!playlist || playlist.trackIds.includes(trackId)) return false;
    this.playlists.update((l) =>
      l.map((p) => (p.id === playlistId ? { ...p, trackIds: [...p.trackIds, trackId] } : p)),
    );
    return true;
  }

  removeFromPlaylist(playlistId: string, trackId: string): void {
    this.playlists.update((l) =>
      l.map((p) => (p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((x) => x !== trackId) } : p)),
    );
  }
}
