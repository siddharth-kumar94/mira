import { useMemo } from "react";
import { SubIssueRow } from "../components/SubIssueRow";
import { Tabs } from "../components/Tabs";
import { Empty, ViewFrame } from "../components/ViewFrame";
import type { MyTab } from "../route";
import { uiStore, useApp } from "../store";
import { IssueView } from "../views/IssueView";
import type { Scope } from "../views/types";

const EMPTY: Record<MyTab, string> = { assigned: "Nothing is assigned to you.", created: "You haven't created any open stories." };

/** Spec §4: your issues across every team, as Assigned or Created. */
export function MyIssues({ tab }: { tab: MyTab }) {
  const scope = useMemo<Scope>(() => ({ kind: "my", tab }), [tab]);
  const subIssues = useApp((s) => s.subIssues);
  const issues = useApp((s) => s.issues);
  const me = useApp((s) => s.meta?.me.id);
  // Planning ruling 10: your sub-issues on someone else's issue, after your own issues.
  const others = useMemo(() => (tab !== "assigned" ? [] : Object.values(subIssues).filter(
    (t) => t.assignee?.id === me && t.status !== "done" && issues[t.issue_id]?.assignee?.id !== me)), [tab, subIssues, issues, me]);
  const tabs = <Tabs label="My stories" tabs={[["assigned", "Assigned"], ["created", "Created"]]} value={tab}
    onChange={(t) => uiStore.getState().navigate({ name: "my", tab: t })} />;
  return (
    <ViewFrame title="My stories">
      <IssueView scope={scope} label="My stories" tabs={tabs} empty={<Empty>{EMPTY[tab]}</Empty>}
        footer={others.length > 0 && (
          <section aria-label="Tasks">
            <h3 className="flex h-(--size-group) items-center rounded-control bg-hover px-4 font-medium text-ink-2">Tasks on others' stories</h3>
            {others.map((t) => <SubIssueRow key={t.id} sub={t} showParent />)}
          </section>
        )} />
    </ViewFrame>
  );
}
