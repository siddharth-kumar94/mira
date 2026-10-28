import { useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import { Icon } from "../components/icons";
import { MainFrame } from "../components/ViewFrame";
import { HOME } from "../route";
import { appStore, uiStore } from "../store";

export const RALLY_KEYS_URL = "https://rally1.rallydev.com/#/detail/userprofile/apikeys";
const separator = "relative before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-line-frame";

/**
 * §19.10 / D14: the key goes to the proxy, which checks it with Rally and saves it; it is never echoed.
 * The field is uncontrolled and cleared on submit, so the key never sits in the DOM (React mirrors a controlled value into the attribute).
 */
export function ConnectCard({ onConnected, wrapTitle = (title) => title }: { onConnected(): void; wrapTitle?: (title: ReactElement) => ReactNode }) {
  const field = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = field.current;
    if (!input || busy) return;
    const key = input.value.trim();
    // Cleared on every submit, a rejected key included: the key never stays in the page, so a retry means pasting again.
    input.value = "";
    if (!key) return setError("Paste a Rally API key");
    setBusy(true);
    setError(null);
    // Accepted: say who, and leave (close the dialog, or go to My issues) before the store reloads.
    const message = await appStore.getState().connect(key, (session) => {
      if (session.me && session.workspace) appStore.getState().pushToast(`Connected as ${session.me.name} · ${session.workspace.name}`);
      onConnected();
    });
    setBusy(false);
    if (message) {
      setError(message);
      field.current?.focus();
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-[10px] bg-surface shadow-card">
      <div className="p-4">
        {wrapTitle(<h1 className="text-regular font-medium leading-[23px] text-ink-1">Connect Mira to Rally</h1>)}
        <p className="mt-1 text-mini leading-[15px] text-ink-3">Paste your Rally API key. Mira checks it with Rally and saves it on this computer.</p>
      </div>
      <div className={`${separator} p-4`}>
        <label htmlFor={`${id}-key`} className="block text-small font-medium leading-4 text-ink-1">Rally API key</label>
        <input ref={field} id={`${id}-key`} type="password" spellCheck={false} autoFocus
          // Keep password managers from saving the key: Chrome ignores "off" on password fields; the data-* hints are 1Password,
          // LastPass and Bitwarden's. The form has no username field for them to pair it with.
          autoComplete="new-password" data-1p-ignore="" data-lpignore="true" data-bwignore=""
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
          className="mt-2 block h-[30px] w-full rounded-control border border-line-frame bg-surface px-2.5 text-small font-[400] text-ink-1 shadow-comment aria-invalid:border-blocked" />
        {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-mini text-blocked">{error}</p>}
      </div>
      <div className={`${separator} flex h-[62px] items-center px-4`}>
        <a href={RALLY_KEYS_URL} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-small font-medium text-ink-2 transition-colors duration-150 hover:text-ink-1">
          Get a key in Rally<Icon name="open" size={14} className="text-ink-3" />
        </a>
        <button type="submit" disabled={busy}
          className="ml-auto h-7 rounded-full bg-accent px-3 text-mini font-medium text-accent-ink disabled:opacity-50">{busy ? "Connecting…" : "Connect"}</button>
      </div>
    </form>
  );
}

/** First run, or no key (§19.10): the settings column with no nav, holding the connect card. Success goes to My issues. */
export function Connect() {
  return (
    <div className="flex h-full bg-app text-small text-ink-1">
      <MainFrame className="">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-[640px] max-w-full pt-16">
            <ConnectCard onConnected={() => uiStore.getState().navigate(HOME)} />
          </div>
        </div>
      </MainFrame>
    </div>
  );
}
