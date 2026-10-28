import type { ReactNode } from "react";
import { StatusBanner } from "./StatusBanner";

/** The content panel beside the sidebar or settings nav (inventory-p4: main 244,8 1476 wide, radius 12, 1px line-frame, shadow-comment). */
export function MainFrame({ children, className = "ml-0" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-palette border border-line-frame bg-panel shadow-comment ${className}`}>
      <StatusBanner />
      {children}
    </main>
  );
}

/** Row 1 of every screen (§18.2) (44px, overlapping row 2 by 1px: Linear's tabs sit at y60, the title centre at 31): the breadcrumb or title at 13/500, actions on the right. The body below owns its scrolling. */
export function ViewFrame({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-(--size-header) shrink-0 -mb-px items-center gap-2 px-[18px]">
        <h1 className="flex min-w-0 items-center gap-1.5 font-medium text-ink-1">{title}</h1>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-ink-3">{children}</p>;
}

/** Row 2 without the issue view's tools: loading and error states keep their tabs (§18.2). */
export function TabsRow({ children }: { children: ReactNode }) {
  return <div className="flex h-(--size-header) shrink-0 items-center gap-2 px-2">{children}</div>;
}
