import { uiStore, useApp, useUi } from "../store";
import { SettingsGroup, SettingsPage, SettingsRow, SettingsSelect } from "./SettingsShell";

const THEMES = [["light", "Light"], ["dark", "Dark"]] as const;

/** §19.10 Preferences: Interface theme, Display names and the read-only Write guard row (§11: nothing here changes the guard). */
export function Preferences() {
  const theme = useUi((u) => u.theme);
  const meta = useApp((s) => s.meta);
  return (
    <SettingsPage title="Preferences">
      <SettingsGroup title="General">
        <SettingsRow title="Interface theme" description="Select your interface color scheme">
          <SettingsSelect label="Interface theme" value={theme === "dark" ? "Dark" : "Light"}
            entries={THEMES.map(([id, label]) => ({ id, label, checked: theme === id, onSelect: () => uiStore.getState().setTheme(id) }))} />
        </SettingsRow>
        <SettingsRow title="Display names" description="Select how names are displayed in the Mira interface">
          <SettingsSelect label="Display names" value="Full name" entries={[{ id: "full", label: "Full name", checked: true }]} />
        </SettingsRow>
        <SettingsRow title="Write guard" description="Change it with rallypoc stack up">
          <span className="text-small font-[400] text-ink-2">
            {!meta ? "Loading…" : meta.writeGuard === "demo" ? `Demo mode: only ${meta.demoPrefix.trim()} items change` : "Off: changes write to Rally"}
          </span>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}
