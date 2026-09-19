import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
}

export interface DialogState {
  kind: 'prompt' | 'confirm';
  title: string;
  message?: string;
  value: string;
  okLabel: string;
  danger: boolean;
  resolve: (value: string | boolean | null) => void;
}

@Injectable({ providedIn: 'root' })
export class UiService {
  readonly toasts = signal<Toast[]>([]);
  readonly dialog = signal<DialogState | null>(null);
  readonly sidebarOpen = signal(false);
  private toastSeq = 0;

  toast(message: string): void {
    const id = ++this.toastSeq;
    this.toasts.update((l) => [...l, { id, message }]);
    setTimeout(() => this.toasts.update((l) => l.filter((t) => t.id !== id)), 3200);
  }

  prompt(title: string, value = '', okLabel = '確定'): Promise<string | null> {
    return new Promise((resolve) =>
      this.open({
        kind: 'prompt',
        title,
        value,
        okLabel,
        danger: false,
        resolve: (v) => resolve(typeof v === 'string' ? v : null),
      }),
    );
  }

  confirm(title: string, message: string, okLabel = '確定', danger = false): Promise<boolean> {
    return new Promise((resolve) =>
      this.open({ kind: 'confirm', title, message, value: '', okLabel, danger, resolve: (v) => resolve(v === true) }),
    );
  }

  closeDialog(result: string | boolean | null): void {
    const d = this.dialog();
    this.dialog.set(null);
    d?.resolve(result);
  }

  private open(state: DialogState): void {
    this.closeDialog(null);
    this.dialog.set(state);
  }
}
