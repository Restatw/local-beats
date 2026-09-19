import { Component, inject } from '@angular/core';
import { Icon } from './icon';
import { ImportService } from './import.service';

const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac';

@Component({
  selector: 'app-upload-button',
  imports: [Icon],
  template: `
    <div class="upload-actions">
      <button type="button" class="btn btn-primary" [disabled]="importer.busy()" (click)="picker.click()">
        <app-icon name="upload" [size]="18" />
        {{ importer.busy() ? '匯入中…' : '上傳音樂' }}
      </button>
      <button type="button" class="btn" [disabled]="importer.busy()" (click)="folderPicker.click()">
        <app-icon name="folder" [size]="18" />
        上傳資料夾
      </button>
    </div>
    <input #picker type="file" hidden multiple data-testid="file-input" [accept]="accept" (change)="pick(picker)" />
    <input
      #folderPicker
      type="file"
      hidden
      multiple
      webkitdirectory
      data-testid="folder-input"
      (change)="pick(folderPicker)"
    />
  `,
  styles: `
    .upload-actions { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
    :host-context(.empty) .upload-actions { flex-direction: row; flex-wrap: wrap; justify-content: center; }
  `,
})
export class UploadButton {
  protected readonly importer = inject(ImportService);
  protected readonly accept = ACCEPT;

  protected async pick(input: HTMLInputElement): Promise<void> {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) await this.importer.import(files);
  }
}
