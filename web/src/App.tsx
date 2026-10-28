import { useEffect } from "react";
import { api } from "./api/client";
import { Sidebar } from "./components/Sidebar";
import { CyclePage } from "./cycles/CyclePage";
import { CyclesList } from "./cycles/CyclesList";
import { Empty, MainFrame, ViewFrame } from "./components/ViewFrame";
import { IssuePage } from "./issue/IssuePage";
import { runAction } from "./keyboard/actions";
import { useShortcuts } from "./keyboard/useShortcuts";
import { Overlays } from "./Overlays";
import { InitiativePage } from "./pm/InitiativePage";
import { InitiativesList } from "./pm/InitiativesList";
import { ProjectPage } from "./pm/ProjectPage";
import { ProjectsView } from "./pm/ProjectsView";
import type { Route } from "./route";
import { IconSheet } from "./screens/IconSheet";
import { MyIssues } from "./screens/MyIssues";
import { TeamIssues } from "./screens/TeamIssues";
import { appStore, uiStore, useApp, useUi } from "./store";
import { startPoller } from "./store/poller";
import { Account } from "./settings/Account";
import { Connect } from "./settings/Connect";
import { Preferences } from "./settings/Preferences";
import { SettingsShell, type SettingsNavKey } from "./settings/SettingsShell";
import { TeamSettings } from "./settings/TeamSettings";
import { TeamsSettings } from "./settings/TeamsSettings";

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "my": return <MyIssues tab={route.tab} />;
    case "team":
      if (route.tab === "cycles") return <CyclesList teamId={route.teamId} />;
      if (route.tab === "projects") return <ProjectsView scope={{ kind: "team", teamId: route.teamId }} />;
      return <TeamIssues teamId={route.teamId} tab={route.tab} />;
    case "issue": return <IssuePage issueKey={route.key} />;
    case "projects": return <ProjectsView scope={{ kind: "workspace" }} />;
    case "initiatives": return <InitiativesList />;
    case "cycle": return <CyclePage teamId={route.teamId} cycleId={route.cycleId} />;
    case "project": return <ProjectPage key={route.key} projectKey={route.key} tab={route.tab} />;
    case "initiative": return <InitiativePage key={route.key} initiativeKey={route.key} tab={route.tab} />;
    case "settings": return route.section === "preferences" ? <Preferences /> : route.section === "account" ? <Account /> : <TeamsSettings />;
    case "team-settings": return <TeamSettings key={route.teamId} teamId={route.teamId} />;
    case "icons": return <IconSheet />;
    case "not-found": return <ViewFrame title="Not found"><Empty>Nothing lives at {route.path}.</Empty></ViewFrame>;
  }
}

export function App() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const route = useUi((u) => u.route);
  const theme = useUi((u) => u.theme);
  const joined = useUi((u) => u.joinedTeamIds);

  useEffect(() => {
    void appStore.getState().load();
    return startPoller(appStore, api);
  }, []);
  useEffect(() => {
    if (status !== "offline") return;
    const timer = setInterval(() => void appStore.getState().load(), 5000); // retry every 5s
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const onPop = () => uiStore.getState().syncFromLocation(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => { // joined teams need their names, so load them once
    if (status !== "ready") return;
    const s = appStore.getState();
    for (const id of joined) if (!s.teams[id] && !s.teamState[id]) void s.loadTeam(id);
  }, [status, joined]);
  useShortcuts(runAction);

  if (status === "needs-key") return <Connect />;
  const body = (
    <>
      {status === "loading" && <Empty>Loading Rally…</Empty>}
      {status === "offline" && <Empty>Waiting for the local server…</Empty>}
      {status === "error" && <Empty>{error}</Empty>}
      {status === "ready" && <Screen route={route} />}
    </>
  );
  const settings: SettingsNavKey | null = route.name === "settings" ? route.section : route.name === "team-settings" ? { teamId: route.teamId } : null;
  return (
    <div className="flex h-full bg-app text-small text-ink-1">
      {settings !== null
        ? <SettingsShell section={settings}>{body}</SettingsShell>
        : <><Sidebar /><MainFrame>{body}</MainFrame></>}
      <Overlays />
    </div>
  );
}
