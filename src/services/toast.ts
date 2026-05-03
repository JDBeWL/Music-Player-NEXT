type ToastType = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

type ToastListener = (toasts: Toast[]) => void;

let nextId = 0;
const toasts: Toast[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  listeners.forEach(cb => cb([...toasts]));
}

function addToast(type: ToastType, message: string, duration = 4000): number {
  const id = nextId++;
  const toast: Toast = { id, type, message, duration };
  toasts.push(toast);
  notify();

  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }

  return id;
}

function removeToast(id: number): void {
  const index = toasts.findIndex(t => t.id === id);
  if (index !== -1) {
    toasts.splice(index, 1);
    notify();
  }
}

function subscribe(listener: ToastListener): () => void {
  listeners.add(listener);
  listener([...toasts]);
  return () => listeners.delete(listener);
}

export const toast = {
  info: (message: string, duration?: number) => addToast('info', message, duration),
  success: (message: string, duration?: number) => addToast('success', message, duration),
  warning: (message: string, duration?: number) => addToast('warning', message, duration),
  error: (message: string, duration?: number) => addToast('error', message, duration ?? 6000),
  remove: removeToast,
  subscribe,
};

export type { Toast, ToastType };
