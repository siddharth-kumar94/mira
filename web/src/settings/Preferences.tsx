import { uiStore, useUi } from "../store";
import { SettingsGroup, SettingsPage, SettingsRow, SettingsSelect } from "./SettingsShell";

const THEMES = [["light", "Light"], ["dark", "Dark"]] as const;

/** §19.10 Preferences: Interface theme and Display names. */
export function Preferences() {
  const theme = useUi((u) => u.theme);
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
      </SettingsGroup>
    </SettingsPage>
  );
}
