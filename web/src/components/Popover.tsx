import { useEffect, useRef, type ReactNode } from "react";

/** A button with a panel under it. A click outside both closes it; Esc closes it through the UI store's overlay order. */
export function Popover({ open, onClose, button, children }: { open: boolean; onClose(): void; button: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);
  return <div ref={ref} className="relative">{button}{open && children}</div>;
}
