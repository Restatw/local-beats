import { Routes } from '@angular/router';
import { LibraryPage } from './pages/library-page';
import { LikedPage } from './pages/liked-page';
import { PlaylistPage } from './pages/playlist-page';
import { SearchPage } from './pages/search-page';

export const routes: Routes = [
  { path: '', component: LibraryPage, title: '音樂庫 · LocalBeats' },
  { path: 'search', component: SearchPage, title: '搜尋 · LocalBeats' },
  { path: 'liked', component: LikedPage, title: '已按讚的歌曲 · LocalBeats' },
  { path: 'playlist/:id', component: PlaylistPage, title: '播放清單 · LocalBeats' },
  { path: '**', redirectTo: '' },
];
