import { Icon } from "./icons";
import { useEffect } from "react";
import { appStore, useApp } from "../store";
import type { Toast } from "../store/store";

function ToastItem({ toast }: { toast: Toast }) {
  useEffect(() => {
    if (toast.retry) return; // keep retryable errors until acted on
    const timer = setTimeout(() => appStore.getState().dismissToast(toast.id), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const dismiss = () => appStore.getState().dismissToast(toast.id);
  return (
    <div className="flex items-start gap-2 rounded-control border border-line-2 bg-surface px-3 py-2 text-ink-2 shadow-palette">
      <span className="flex-1">{toast.message}</span>
      {toast.retry && (
        <button type="button" className="font-medium text-ink-1" onClick={() => { dismiss(); toast.retry?.(); }}>Retry</button>
      )}
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="text-ink-3"><Icon name="close" size={14} /></button>
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
