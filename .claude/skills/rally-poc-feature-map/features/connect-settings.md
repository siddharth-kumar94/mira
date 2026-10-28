# Connect & settings

Last verified: f064d7ee53a4 on 2026-10-20 (live)

How a person connects Mira to Rally and changes how it behaves. When the proxy has no usable key, the whole app is replaced by the "Connect Mira to Rally" card. Once connected, "Settings" (`/settings/*`, from the workspace menu) swaps the sidebar for a settings nav: Personal (Preferences, Account), Administration (Teams) and one item per sidebar team. Overall: beta. Connecting works, but a valid key, Disconnect and a team's settings page were never driven against the user's real account on purpose or for lack of time.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| connect-card | With no key, a centred card: title, key field (password managers kept out), "Get a key in Rally" link, "Connect"; an invalid key shows an inline error and stays on the card | beta (stable pending live) | UI+API | e0ed072 | 2026-10-20 | `web/src/settings/Connect.tsx:14`, `Connect.tsx:45`, `web/src/settings/Settings.test.tsx::the key field keeps password managers out`, `web/src/store/pm.test.ts::connect: a rejected key says so and leaves the app needing a key`; only the invalid-key path ran live (flow `connect`); the no-key screen needs a Disconnect, which was not driven |
| connect-key-change | Account › "Change key" opens the card in a dialog; a key for another account drops the old account's data and toasts who you are now | beta (stable pending live) | UI+API | 76c18bc | 2026-10-20 | `web/src/settings/Account.tsx:27`, `Settings.test.tsx::Change key to another account: the dialog closes, a toast names it, and the old account's data is gone`, `::Change key, rejected`, flow `connect` (invalid key, Mira stays connected); a valid replacement key was never sent |
| settings-shell | "‹ Back to app", a search field, Personal, Administration, Your teams; Back returns to the last screen outside settings | stable | UI | e0ed072 | 2026-10-20 | `web/src/settings/SettingsShell.tsx:29`, `SettingsShell.tsx:75`, `Settings.test.tsx::settings replace the app sidebar; Back to app returns to the last screen outside settings`, `::the nav: Personal (Preferences, Account), Administration (Teams), Your teams (one per sidebar team)`, flow `settings` |
| settings-preferences | Interface theme (Light/Dark), Display names | beta | UI | e0ed072 | 2026-10-20 | `web/src/settings/Preferences.tsx:7`, `Preferences.tsx:20`, `Settings.test.tsx::Preferences: Interface theme, Display names`, flow `settings` (theme flips `data-theme` and is put back); the dark theme was never measured against Linear |
| settings-account | "Connected as <name> · <workspace>", the masked key, "Change key", "Disconnect" | beta (stable pending live) | UI+API | e0ed072 | not driven | `web/src/settings/Account.tsx:11`, `Settings.test.tsx::Account: connected as you, a masked key with Change key, and Disconnect`; Account opened in flow `connect`, but "Disconnect" is never clicked live |
| settings-teams | Teams card: tile, name, ART or Team, Join or Leave, "Show in sidebar" switch; "Find a team" searches Rally's teams | beta | UI | 7ef06dc | 2026-10-20 | `web/src/settings/TeamsSettings.tsx:79`, `web/src/settings/Teams.test.tsx::Teams lists your sidebar and joined teams`, `::Find a team searches Rally's teams and lists them with Join`, flow `settings` (Teams lists the demo team); there is no all-teams endpoint, so the list is your sidebar and joined teams plus search; layout copy was not measured |
| settings-team-page | `/settings/teams/:id`: "‹ Teams", name, "Team overview ›", read-only rows Members, Story statuses, Sprints (cadence), Child teams (ART only); loading, error and not-found states | beta (stable pending live) | UI | 7ef06dc | not driven | `web/src/settings/TeamSettings.tsx:57`, `web/src/settings/cadence.ts:10`, `Teams.test.tsx::team settings for an ART`, `::team settings for a team`, `::team settings when the loads fail`; only the Sprints row links anywhere; a joined team that has not loaded reads "Team <id>" |

## How to get to it (user POV)

1. Open http://127.0.0.1:5173. With no usable key the page reads "Connect Mira to Rally": paste a Rally API key and press "Connect".
2. With a key, open the workspace menu at the top left and choose "Settings".
3. Pick "Preferences", "Account" or "Teams" in the left nav, or a team under "Your teams".
4. To change the key: "Account" › "Change key". To go back: "‹ Back to app".

## Driving it

Preconditions: baseline. Never send a valid key from a script and never click Disconnect on the user's key.

- **settings-shell**, **settings-preferences**, **settings-teams**: → `rallypoc browser run settings` → PASS, `flow-settings.png` (the theme select flips and is put back, Teams lists the demo team).
- **connect-card**, **connect-key-change**: → `rallypoc browser run connect` → PASS (an invalid key shows Rally's rejection under the field and Mira stays connected). Also `rallypoc check api` → `api:connect-invalid` PASS (HTTP 401, still connected).
- **settings-team-page**: → open http://127.0.0.1:5173/settings/teams/<team id> → "Team overview" and the Members and Sprints rows. Not driven.

## Gotchas

- **Changing the key is the only way to reconnect.** The README's troubleshooting line points to Settings › Account for a connected app; with no key the card appears in place of the app.
- **A key for another account drops the old account's cached data** (`76c18bc`), so a changed key looks like a fresh load.
- **Dark select face.** The theme select's face is invisible in the dark theme (ledger Task 17 follow-up).
