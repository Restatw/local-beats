import { Component, inject } from '@angular/core';
import { Icon } from '../icon';
import { ImportService } from '../import.service';
import { CloudService } from './cloud.service';

@Component({
  selector: 'app-cloud-button',
  imports: [Icon],
  template: `
    <button type="button" class="btn" data-testid="cloud-open" [disabled]="importer.busy()" (click)="cloud.open()">
      <app-icon name="cloud" [size]="18" /> 從雲端匯入
    </button>
  `,
})
export class CloudButton {
  protected readonly cloud = inject(CloudService);
  protected readonly importer = inject(ImportService);
}
