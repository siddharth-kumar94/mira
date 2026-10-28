import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { appStore, useApp } from "../store";
import { ConnectCard } from "./Connect";
import { SettingsButton, SettingsGroup, SettingsPage, SettingsRow } from "./SettingsShell";

/** A fixed mask: the client never has the key (D14), and the row must not hint at any part of it. */
const KEY_MASK = "••••••••••••••••";

/** §19.10 Account: who you are connected as, the masked key with "Change key", and "Disconnect". */
export function Account() {
  const meta = useApp((s) => s.meta);
  const [changing, setChanging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const who = meta ? `${meta.me.name} · ${meta.workspace.name}` : "";
  // Disconnect clears the caches and sets needs-key; the app then shows Connect in place of everything.
  const disconnect = async () => {
    setLeaving(true);
    await appStore.getState().disconnect();
    setLeaving(false);
  };
  return (
    <SettingsPage title="Account">
      <SettingsGroup title="Rally">
        <SettingsRow title={`Connected as ${who}`} description="Mira reads and writes Rally as this user" />
        <SettingsRow title="Rally API key" description={KEY_MASK}>
          <SettingsButton onClick={() => setChanging(true)}>Change key</SettingsButton>
        </SettingsRow>
        <SettingsRow title="Disconnect" description="Forget the saved key on this computer">
          <SettingsButton onClick={() => void disconnect()} disabled={leaving}>Disconnect</SettingsButton>
        </SettingsRow>
      </SettingsGroup>
      <Dialog.Root open={changing} onOpenChange={setChanging}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/[0.24]" />
          <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-[130px] z-50 w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2">
            <ConnectCard onConnected={() => setChanging(false)} wrapTitle={(title) => <Dialog.Title asChild>{title}</Dialog.Title>} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </SettingsPage>
  );
}
