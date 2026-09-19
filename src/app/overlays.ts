import { Component, ElementRef, HostListener, effect, inject, viewChild } from '@angular/core';
import { UiService } from './ui.service';

@Component({
  selector: 'app-overlays',
  template: `
    @if (ui.dialog(); as d) {
      <div class="modal-backdrop" (click)="ui.closeDialog(null)">
        <form class="modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()" (submit)="submit($event)">
          <h2>{{ d.title }}</h2>
          @if (d.message) {
            <p class="muted">{{ d.message }}</p>
          }
          @if (d.kind === 'prompt') {
            <input #field class="input" name="value" [value]="d.value" maxlength="60" autocomplete="off" />
          }
          <div class="modal-actions">
            <button type="button" class="btn" (click)="ui.closeDialog(null)">取消</button>
            <button type="submit" class="btn" [class.btn-danger]="d.danger" [class.btn-primary]="!d.danger">
              {{ d.okLabel }}
            </button>
          </div>
        </form>
      </div>
    }
    <div class="toasts" aria-live="polite">
      @for (t of ui.toasts(); track t.id) {
        <div class="toast">{{ t.message }}</div>
      }
    </div>
  `,
})
export class Overlays {
  protected readonly ui = inject(UiService);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    effect(() => {
      const el = this.field()?.nativeElement;
      el?.focus();
      el?.select();
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.ui.dialog()) this.ui.closeDialog(null);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const d = this.ui.dialog();
    if (!d) return;
    if (d.kind === 'confirm') return this.ui.closeDialog(true);
    const value = this.field()?.nativeElement.value.trim();
    if (value) this.ui.closeDialog(value);
  }
}
