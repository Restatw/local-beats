import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CloudDialog } from './cloud/cloud-dialog';
import { Icon } from './icon';
import { ImportService } from './import.service';
import { Overlays } from './overlays';
import { PlayerBar } from './player-bar';
import { Sidebar } from './sidebar';
import { UiService } from './ui.service';
import { filesFromDrop } from './util';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Sidebar, PlayerBar, Overlays, CloudDialog, Icon],
  template: `
    <div
      class="app"
      (dragenter)="dragEnter($event)"
      (dragover)="$event.preventDefault()"
      (dragleave)="dragLeave()"
      (drop)="drop($event)"
    >
      <app-sidebar />
      <main class="main" id="main">
        <header class="topbar">
          <button type="button" class="icon-btn" aria-label="開啟選單" (click)="ui.sidebarOpen.set(true)">
            <app-icon name="menu" [size]="26" />
          </button>
          <span class="topbar-title">LocalBeats</span>
        </header>
        <router-outlet />
      </main>
      <app-player-bar />
      @if (dragging()) {
        <div class="drop-overlay">放開以匯入音樂檔案或資料夾</div>
      }
    </div>
    <app-cloud-dialog />
    <app-overlays />
  `,
})
export class App {
  protected readonly ui = inject(UiService);
  private readonly importer = inject(ImportService);
  protected readonly dragging = signal(false);
  private dragDepth = 0;

  protected dragEnter(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    this.dragDepth++;
    this.dragging.set(true);
  }

  protected dragLeave(): void {
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (!this.dragDepth) this.dragging.set(false);
  }

  protected async drop(e: DragEvent): Promise<void> {
    e.preventDefault();
    this.dragDepth = 0;
    this.dragging.set(false);
    if (!e.dataTransfer) return;
    const files = await filesFromDrop(e.dataTransfer);
    if (files.length) await this.importer.import(files);
  }
}
