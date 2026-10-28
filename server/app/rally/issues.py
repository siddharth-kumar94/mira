"""Issue reads: your teams, bootstrap, team loads, the All tab, changes, detail, search, people, labels (spec §6.2)."""
import asyncio
import html
import re
from datetime import datetime, timedelta

from ..cycles import cut_cycles, cycle_key, stats_for
from ..domain import (BadRequest, Bootstrap, Changes, Cycle, CycleDetail, CycleList, IssueDetail, IssuePage, SearchResult, Team,
                      TeamLoad, User)
from .base import ARTIFACT_TYPES, CHUNK, RallyBase, dedupe, unique_users
from .client import RallyError
from .mapping import (CYCLE_FETCH, ISSUE_FETCH, POST_FETCH, REVISION_FETCH, STATS_FETCH, SUB_ISSUE_FETCH, TEAM_FETCH,
                      TYPE_PATH, activities_from_rally, and_query, comment_from_rally, cycle_from_rally, issue_from_rally,
                      iso, oid, or_query, project_from_rally, quoted, stats_issue_from_rally, sub_issue_from_rally, tag_name_clause,
                      team_from_rally, user_from_rally)

TEAM_WINDOW = timedelta(days=120)  # spec assumption 1
RECENT_DONE = timedelta(days=14)   # spec assumption 2
MINE = "(Owner = currentuser) OR (CreatedBy = currentuser)"
PAGE = 100                        # spec assumption 4
MAX_TEAMS = 20
CYCLE_LOOKBACK = timedelta(days=60)
RECENT_PROJECTS = timedelta(days=30)
CHILD_DEPTH = 3                    # how far below an ART its child teams are looked for
MAX_PAST_CYCLES = 50
CYCLE_ROWS = 1000
ENDED_FIRST_READ = 200             # rows of ended iterations read first; one page, widened only when it is short of cycles
STATS_PAGE = 2000                  # WSAPI's largest page
SINCE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$")
KEY_RE = re.compile(r"^[A-Za-z]{1,4}\d+$")


def done_window_start(cycles: list[Cycle], now: datetime) -> str:
    """Spec assumption 3: done issues from the last 2 cycles (current + previous), and at least the last 14 days."""
    floor = iso(now - RECENT_DONE)
    started = sorted((c.start for c in cycles if c.start <= iso(now)), reverse=True)
    return min(started[1], floor) if len(started) >= 2 else floor


def open_projects_query(now: datetime) -> str:
    """Open projects plus those finished in the last 30 days (planning ruling 6)."""
    return or_query(["State = null", 'State.Name != "Done"', f'ActualEndDate > "{iso(now - RECENT_PROJECTS)}"'])


class IssueReads(RallyBase):
    async def your_team_ids(self, now: datetime) -> list[int]:
        """Spec D6: projects where you owned or created issues in the last 120 days, Rally memberships, the demo team."""
        me = await self.me()
        activity, memberships = await asyncio.gather(
            self.artifacts(and_query([MINE, f'LastUpdateDate > "{iso(now - TEAM_WINDOW)}"']), fetch="Project",
                           order="LastUpdateDate DESC", limit=1000),
            self.client.query(f"/user/{me.id}/TeamMemberships", {"fetch": "ObjectID"}, limit=200))
        ids = {oid(r.get("Project")) for r in activity} | {oid(r) for r in memberships}
        if self.settings.rally_project:
            ids.add(self.settings.rally_project)
        return sorted(i for i in ids if i)

    async def bootstrap(self) -> Bootstrap:
        now = self.clock()
        done_since = iso(now - RECENT_DONE)
        me, workspace, team_ids = await asyncio.gather(self.me(), self.workspace(), self.your_team_ids(now))
        issue_rows, sub_rows, teams, priority = await asyncio.gather(
            self.artifacts(and_query([MINE, f'(ScheduleState < "Accepted") OR (AcceptedDate > "{done_since}")']), limit=1000),
            self.client.query("/task", await self.params(
                fetch=SUB_ISSUE_FETCH, order="TaskIndex",
                query=and_query(["Owner = currentuser", f'(State < "Completed") OR (LastUpdateDate > "{done_since}")'])), limit=500),
            self.teams(team_ids), self.pm_priority())
        issues = [issue_from_rally(o) for o in issue_rows]
        sub_issues = [sub_issue_from_rally(o) for o in sub_rows]
        known = {i.id for i in issues}
        parent_ids = [s.issue_id for s in sub_issues if s.issue_id not in known]
        parents = [issue_from_rally(o) for o in await self.by_ids("/artifact", ISSUE_FETCH, parent_ids, types="HierarchicalRequirement,Defect")]
        everything = issues + parents
        cycles, projects, users = await self.refs(everything, sub_issues)
        demo = self.settings.rally_project or None
        teams.sort(key=lambda t: (t.id != demo, t.name.lower()))
        return Bootstrap(
            me=me, workspace=workspace, write_guard=self.settings.write_guard, demo_prefix=self.settings.demo_prefix,
            demo_tag=self.settings.demo_tag, demo_team_id=demo, teams=teams, issues=everything,
            sub_issues=sub_issues, cycles=cycles, projects=projects, users=unique_users([me, *users]),
            server_time=self.now_stamp(now), project_priority=priority["feature"] is not None,
            initiative_priority=priority["capability"] is not None,
        )

    async def team_load(self, team_id: int) -> TeamLoad:
        now = self.clock()
        team = await self.team(team_id)
        project_fetch, element = await self.project_fetch(), await self.priority_element("feature")
        cycle_rows = await self.client.query("/iteration", await self.params(
            team, fetch=CYCLE_FETCH, query=f'(EndDate >= "{iso(now - CYCLE_LOOKBACK)}")', order="StartDate ASC"), limit=60)
        cycles = [cycle_from_rally(r) for r in cycle_rows]
        open_rows, done_rows, project_rows, member_rows, child_teams = await asyncio.gather(
            self.artifacts('(ScheduleState < "Accepted")', team, limit=3000),
            self.artifacts(f'(AcceptedDate >= "{done_window_start(cycles, now)}")', team, limit=1000),
            self.client.query("/portfolioitem/feature", await self.params(
                team, fetch=project_fetch, query=open_projects_query(now), order="PlannedEndDate"), limit=1000),
            self.client.query(f"/project/{team.id}/TeamMembers", {"fetch": "ObjectID,DisplayName"}, limit=500),
            self.child_teams(team))
        issues = [issue_from_rally(o) for o in dedupe(open_rows + done_rows)]
        projects = [project_from_rally(r, element) for r in project_rows]
        more_cycles, more_projects, users = await self.refs(
            issues, have_cycles=[c.id for c in cycles], have_projects=[p.id for p in projects])
        members = [u for u in map(user_from_rally, member_rows) if u]
        return TeamLoad(team=team, issues=issues, cycles=cycles + more_cycles, projects=projects + more_projects,
                        users=unique_users([*users, *members]), member_ids=[m.id for m in members],
                        server_time=self.now_stamp(now), child_teams=child_teams)

    async def child_teams(self, team: Team) -> list[Team]:
        """The open teams below an ART, down to CHILD_DEPTH levels. A plain team has none (and costs no query)."""
        if team.level != "art":
            return []
        seen, found, level = {team.id}, [], [team.id]
        for _ in range(CHILD_DEPTH):
            rows = await self.client.query("/project", await self.params(
                fetch=TEAM_FETCH, query=or_query([f"Parent = /project/{i}" for i in level]), order="Name"), limit=1000)
            level = []
            for row in rows:
                child = team_from_rally(row)
                if child.id in seen or (row.get("State") or "Open") == "Closed":
                    continue
                seen.add(child.id)
                self._teams[child.id] = child
                found.append(child)
                if child.level == "art":
                    level.append(child.id)
            if not level:
                break
        return found

    async def team_cycles(self, team_id: int, past: int = 2) -> CycleList:
        """Spec §19.3: the team's current and future cycles plus the last `past` ended ones, each with its points."""
        if not 0 <= past <= MAX_PAST_CYCLES:
            raise BadRequest(f"past must be between 0 and {MAX_PAST_CYCLES}")
        now = self.clock()
        team = await self.team(team_id)
        rows, truncated = await self.recent_iterations(team, now, past)
        cycles, has_older = cut_cycles([cycle_from_rally(r) for r in rows], now, past)
        issues = await self.cycle_issues(team, [c.id for c in cycles], STATS_FETCH, stats_issue_from_rally, STATS_PAGE)
        return CycleList(cycles=cycles, stats=stats_for([c.id for c in cycles], issues), has_older=has_older or truncated)

    async def recent_iterations(self, team: Team, now: datetime, past: int) -> tuple[list[dict], bool]:
        """The team's iterations that end at or after now, and the newest ended ones: enough of them for `past` distinct
        cycles plus one more, which is what makes `has_older` true. Never all of history. The bool says the ended read
        stopped at its row limit while still short of cycles."""
        params, stamp = await self.params(team, fetch=CYCLE_FETCH), iso(now)

        async def ended() -> tuple[list[dict], bool]:
            for limit in (ENDED_FIRST_READ, CYCLE_ROWS):
                rows = await self.client.query("/iteration", {**params, "query": f'(EndDate < "{stamp}")', "order": "EndDate DESC"},
                                               limit=limit)
                keys = {(r["Name"], r["StartDate"], r["EndDate"]) for r in rows}
                if len(keys) > past or len(rows) < limit:
                    return rows, False
            return rows, True

        ahead, (behind, truncated) = await asyncio.gather(
            self.client.query("/iteration", {**params, "query": f'(EndDate >= "{stamp}")', "order": "StartDate ASC"}, limit=CYCLE_ROWS),
            ended())
        return dedupe(ahead + behind), truncated

    async def cycle_issues(self, team: Team, cycle_ids: list[int], fetch: str, convert, pagesize: int = 200) -> list:
        """Artifacts of the team (an ART's children included) in any of the cycles, CHUNK iterations per query, run in
        parallel. Scoped to the team because Rally matches `Iteration = X` against every team's same-named, same-dated
        iteration: unscoped, it returns the whole train's stories."""
        ids = sorted(set(cycle_ids))
        batches = await asyncio.gather(*(
            self.artifacts(or_query([f"Iteration = /iteration/{i}" for i in ids[n:n + CHUNK]]), team, limit=5000,
                           order="ObjectID", fetch=fetch, pagesize=pagesize)
            for n in range(0, len(ids), CHUNK)))
        return [convert(o) for o in dedupe(r for b in batches for r in b)]

    async def cycle_siblings(self, team: Team, cycle_id: int) -> tuple[Cycle, list[Cycle]]:
        """A cycle and the iterations of the team's scope that share its name and dates (itself included)."""
        params = await self.params(team, fetch=CYCLE_FETCH)
        found = await self.client.query("/iteration", {**params, "query": f"(ObjectID = {int(cycle_id)})"}, limit=1)
        if not found:
            raise RallyError(404, f"Sprint {cycle_id} was not found")
        row = found[0]
        same = and_query([f"Name = {quoted(row['Name'])}", f'StartDate = "{row["StartDate"]}"', f'EndDate = "{row["EndDate"]}"'])
        rows = await self.client.query("/iteration", {**params, "query": same, "order": "ObjectID"}, limit=100)
        cycle = cycle_from_rally(row)
        return cycle, [c for c in map(cycle_from_rally, dedupe([row, *rows])) if cycle_key(c) == cycle_key(cycle)]

    async def cycle_detail(self, team_id: int, cycle_id: int) -> CycleDetail:
        """Spec §19.4: a cycle and the iterations of its child teams that share its name and dates, with all their issues."""
        team = await self.team(team_id)
        cycle, siblings = await self.cycle_siblings(team, cycle_id)
        issues = await self.cycle_issues(team, [c.id for c in siblings], ISSUE_FETCH, issue_from_rally)
        _, projects, users = await self.refs(issues, have_cycles=[i.cycle_id for i in issues if i.cycle_id])
        teams = await self.teams([*(c.team_id for c in siblings), *(i.team_id for i in issues)])
        return CycleDetail(cycle=cycle, siblings=siblings, issues=issues, projects=projects, users=users, teams=teams)

    async def team_issues(self, team_id: int, cursor: int = 1) -> IssuePage:
        """The All tab: every issue in the team, newest update first, 100 at a time."""
        if cursor < 1:
            raise BadRequest("cursor starts at 1")
        team = await self.team(team_id)
        params = await self.params(team, types=ARTIFACT_TYPES, fetch=ISSUE_FETCH, query="(ObjectID > 0)",
                                   order="LastUpdateDate DESC")
        rows, total = await self.client.page("/artifact", params, start=cursor, pagesize=PAGE)
        issues = [issue_from_rally(o) for o in rows]
        cycles, projects, users = await self.refs(issues)
        after = cursor + len(rows)
        return IssuePage(issues=issues, next_cursor=after if rows and after <= total else None, cycles=cycles,
                         projects=projects, users=users)

    async def changes(self, since: str, team_ids: list[int]) -> Changes:
        if not SINCE_RE.fullmatch(since):
            raise BadRequest("since must be an ISO time like 2026-10-16T06:25:17.000Z")
        if len(team_ids) > MAX_TEAMS:
            raise BadRequest(f"at most {MAX_TEAMS} teams")
        now = self.clock()
        teams = await self.teams(team_ids)
        updated = f'LastUpdateDate > "{since}"'
        issue_batches = await asyncio.gather(
            self.artifacts(and_query([MINE, updated]), limit=500),
            *(self.artifacts(f"({updated})", t, limit=500) for t in teams))
        mine_params = await self.params(fetch=SUB_ISSUE_FETCH, query=and_query(["Owner = currentuser", updated]))
        team_params = [await self.params(t, fetch=SUB_ISSUE_FETCH, query=f"({updated})") for t in teams]
        sub_batches = await asyncio.gather(*(self.client.query("/task", p, limit=300) for p in [mine_params, *team_params]))
        issues = [issue_from_rally(o) for o in dedupe(r for b in issue_batches for r in b)]
        sub_issues = [sub_issue_from_rally(o) for o in dedupe(r for b in sub_batches for r in b)]
        cycles, projects, users = await self.refs(issues, sub_issues)
        return Changes(issues=issues, sub_issues=sub_issues, cycles=cycles, projects=projects, users=users,
                       server_time=self.now_stamp(now))

    async def find_issue_row(self, ref: str) -> dict:
        """An issue by ObjectID or by key (US1234, any case), anywhere in the workspace."""
        text = str(ref).strip()
        if text.isdigit():
            query = f"(ObjectID = {int(text)})"
        elif KEY_RE.fullmatch(text):
            query = f"(FormattedID = {quoted(text.upper())})"
        else:
            raise BadRequest("a story is identified by its ID, like US1234")
        rows = await self.artifacts(query, limit=1)
        if not rows:
            raise RallyError(404, f"Story {text.upper()} was not found")
        return rows[0]

    async def posts(self, artifact_ref: str, order: str = "CreationDate ASC") -> list[dict]:
        return await self.client.query("/conversationpost", await self.params(
            fetch=POST_FETCH, query=f"(Artifact = {artifact_ref})", order=order), limit=200)

    async def get_issue(self, ref: str) -> IssueDetail:
        row = await self.find_issue_row(ref)
        issue = issue_from_rally(row)
        artifact = f"/{TYPE_PATH[issue.kind]}/{issue.id}"
        history = oid(row.get("RevisionHistory"))
        sub_rows, post_rows, revision_rows = await asyncio.gather(
            self.client.query("/task", await self.params(fetch=SUB_ISSUE_FETCH, query=f"(WorkProduct = {artifact})",
                                                         order="TaskIndex"), limit=200),
            self.posts(artifact),
            self.client.query(f"/revisionhistory/{history}/Revisions", {"fetch": REVISION_FETCH, "order": "RevisionNumber DESC"},
                              limit=100) if history else asyncio.sleep(0, []))
        sub_issues = [sub_issue_from_rally(o) for o in sub_rows]
        comments = [comment_from_rally(o) for o in post_rows]
        activity = [a for o in revision_rows for a in activities_from_rally(o)]
        cycles, projects, users = await self.refs([issue], sub_issues)
        people = [*users, *(c.author for c in comments), *(a.author for a in activity)]
        return IssueDetail(issue=issue, sub_issues=sub_issues, comments=comments, activity=activity, cycles=cycles,
                           projects=projects, users=unique_users(people))

    async def search(self, text: str) -> SearchResult:
        """⌘K fallback (spec §6.2): issues anywhere, plus teams and projects by name."""
        text = text.strip()
        if len(text) < 2:
            return SearchResult(issues=[], teams=[], projects=[])
        q = quoted(text)
        by_key = [f"FormattedID = {quoted(text.upper())}"] if KEY_RE.fullmatch(text) else []
        project_fetch, element = await self.project_fetch(), await self.priority_element("feature")
        issue_rows, team_rows, project_rows = await asyncio.gather(
            self.artifacts(or_query([f"Name contains {q}", *by_key]), limit=10, order="LastUpdateDate DESC"),
            self.client.query("/project", await self.params(fetch=TEAM_FETCH, query=and_query([f"Name contains {q}", 'State = "Open"'])), limit=8),
            self.client.query("/portfolioitem/feature", await self.params(fetch=project_fetch, query=or_query([f"Name contains {q}", *by_key])), limit=8))
        return SearchResult(issues=[issue_from_rally(o) for o in issue_rows], teams=[team_from_rally(o) for o in team_rows],
                            projects=[project_from_rally(o, element) for o in project_rows])

    async def users(self, text: str) -> list[User]:
        """The assignee picker's search over every workspace user (spec D16)."""
        text = text.strip()
        if len(text) < 2:
            return []
        rows = await self.client.query("/user", await self.params(
            fetch="ObjectID,DisplayName", query=and_query([f"DisplayName contains {quoted(text)}", "Disabled = false"]),
            order="DisplayName"), limit=20)
        return [u for u in map(user_from_rally, rows) if u]

    async def labels(self, text: str) -> list[str]:
        text = text.strip()
        clause = tag_name_clause(text, exact=False) if text else None
        clauses = ([clause] if clause else []) + ["Archived = false"]
        rows = await self.client.query("/tag", await self.params(fetch="Name", query=and_query(clauses), order="Name"), limit=30)
        names = [html.unescape(r["Name"]) for r in rows]
        if text and clause != f"Name contains {quoted(text)}":  # Rally searched only a piece of it: finish on the plain text
            names = [n for n in names if text.lower() in n.lower()]
        return names
