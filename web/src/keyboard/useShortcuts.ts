import { useEffect, useLayoutEffect, useRef } from "react";
import { resolveKey, type Action } from "./shortcuts";

export function useShortcuts(onAction: (action: Action) => void): void {
  const handler = useRef(onAction);
  useLayoutEffect(() => {
    handler.current = onAction;
  });
  useEffect(() => {
    let prefix: "g" | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // a dialog (palette, composer) already handled it
      const result = resolveKey(e, prefix);
      prefix = result.prefix;
      clearTimeout(timer);
      if (prefix) timer = setTimeout(() => (prefix = null), 1000);
      if (result.action) {
        e.preventDefault();
        handler.current(result.action);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, []);
}
