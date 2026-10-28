"""Projects (Features), initiatives (Capabilities) and PIs (Releases) for the PM layer (spec §6.2, §9)."""
import asyncio
from collections.abc import Iterable
from datetime import date, timedelta
from typing import Literal

from ..burnup import series
from ..domain import (BadRequest, Burnup, Comment, CommentCreate, Initiative, InitiativeDetail, InitiativeList, PortfolioPatch, Project,
                      ProjectDetail, ProjectList, Release, Update, UpdateCreate)
from ..pm import format_update, initiative_health, project_health, split_posts, update_from_comment
from .base import CHUNK, dedupe, unique_users
from .client import RallyError
from .issues import KEY_RE, IssueReads, open_projects_query
from .mapping import (INITIATIVE_FETCH, ISSUE_FETCH, POST_FETCH, PROJECT_FETCH, RELEASE_FETCH, and_query, comment_from_rally,
                      day, end_day, initiative_from_rally, issue_from_rally, oid, or_query, portfolio_priority_to_rally,
                      project_from_rally, quoted, release_from_rally, snapshot_from_rally, tag_names)

BLOCKED_TTL = timedelta(seconds=60)  # planning ruling 7
BURNUP_FIELDS = ["ObjectID", "PlanEstimate", "ScheduleState", "_ValidFrom", "_ValidTo"]
BURNUP_DEFAULT_SPAN = timedelta(days=30)  # a project with no planned start
UPDATE_MARK = "Mira update"
_PORTFOLIO_TYPE_KEY = {"project": "PortfolioItem/Feature", "initiative": "PortfolioItem/Capability"}


def merge_releases(releases: Iterable[Release]) -> list[Release]:
    """Team copies of one PI (same name and dates) become one Release keeping every copy's id; sorted by start."""
    merged: dict[tuple, Release] = {}
    for rel in releases:
        key = (rel.name, rel.start, rel.end)
        if key not in merged:
            merged[key] = rel.model_copy(update={"ids": list(dict.fromkeys(rel.ids or [rel.id]))})
        else:
            have = merged[key].ids
            have.extend(i for i in (rel.ids or [rel.id]) if i not in have)
    return sorted(merged.values(), key=lambda r: r.start or "")


class PortfolioReads(IssueReads):
    async def project_releases(self, projects: Iterable[Project]) -> list[Release]:
        """Every PI the projects point at, by id and without a cap, merged across team copies."""
        rows = await self.by_ids("/release", RELEASE_FETCH, {p.pi_id for p in projects if p.pi_id})
        return merge_releases(release_from_rally(r) for r in rows)

    async def blocked_counts(self) -> dict[int, int]:
        """Blocked open stories per project, from one workspace-wide query cached for a minute."""
        now = self.clock()
        if self._blocked and now - self._blocked[0] < BLOCKED_TTL:
            return self._blocked[1]
        rows = await self.client.query("/hierarchicalrequirement", await self.params(
            fetch="Feature", query='((Blocked = true) AND (ScheduleState < "Accepted"))'), limit=2000)
        counts: dict[int, int] = {}
        for r in rows:
            fid = oid(r.get("Feature"))
            if fid:
                counts[fid] = counts.get(fid, 0) + 1
        self._blocked = (now, counts)
        return counts

    async def latest_updates(self, type_path: str, ids) -> dict[int, Update]:
        """The newest Mira update on each item."""
        wanted = sorted(set(ids))
        if not wanted:
            return {}
        base = await self.params(fetch="ObjectID,Text,User,CreationDate,Artifact", order="CreationDate DESC")
        batches = await asyncio.gather(*(
            self.client.query("/conversationpost", {**base, "query": and_query([
                f"Text contains {quoted(UPDATE_MARK)}", or_query([f"Artifact = /{type_path}/{i}" for i in wanted[n:n + CHUNK]])])},
                limit=400)
            for n in range(0, len(wanted), CHUNK)))
        latest: dict[int, Update] = {}
        for row in (r for batch in batches for r in batch):
            update = update_from_comment(comment_from_rally(row))
            artifact = oid(row["Artifact"])
            if update and artifact not in latest:
                latest[artifact] = update
        return latest

    async def capability_states(self) -> dict[str, int]:
        if self._capability_states is None:
            rows = await self.client.query("/state", await self.params(
                fetch="Name,OrderIndex", query='(TypeDef.Name = "Capability")', order="OrderIndex"), limit=50)
            self._capability_states = {r["Name"]: int(r["OrderIndex"]) for r in rows}
        return self._capability_states

    async def find_portfolio_row(self, type_path: str, fetch: str, ref: str) -> dict:
        text = str(ref).strip()
        if text.isdigit():
            query = f"(ObjectID = {int(text)})"
        elif KEY_RE.fullmatch(text):
            query = f"(FormattedID = {quoted(text.upper())})"
        else:
            raise BadRequest("give an ID like F1234")
        rows = await self.client.query(f"/{type_path}", await self.params(fetch=fetch, query=query), limit=1)
        if not rows:
            raise RallyError(404, f"{text.upper()} was not found")
        return rows[0]

    async def _with_health(self, rows: list[dict]) -> list[Project]:
        element = await self.priority_element("feature")
        projects = [project_from_rally(r, element) for r in dedupe(rows)]
        blocked, latest = await asyncio.gather(self.blocked_counts(),
                                               self.latest_updates("portfolioitem/feature", [p.id for p in projects]))
        today = self.clock().date()
        return [p.model_copy(update={"latest_update": latest.get(p.id),
                                     "health": project_health(p, today=today, blocked=blocked.get(p.id, 0), latest=latest.get(p.id))})
                for p in projects]

    async def list_projects(self, team_ids: list[int], initiative_id: int | None = None) -> ProjectList:
        fetch = await self.project_fetch()
        if initiative_id is not None:
            rows = await self.client.query("/portfolioitem/feature", await self.params(
                fetch=fetch, query=f"(Parent = /portfolioitem/capability/{int(initiative_id)})", order="PlannedEndDate"), limit=500)
        else:
            if not team_ids:
                raise BadRequest("give teams or a capability")
            now = self.clock()
            teams = await self.teams(team_ids)
            all_params = [await self.params(t, fetch=fetch, query=open_projects_query(now), order="PlannedEndDate")
                          for t in teams]
            batches = await asyncio.gather(*(self.client.query("/portfolioitem/feature", p, limit=1000) for p in all_params))
            rows = [r for batch in batches for r in batch]
        projects = await self._with_health(rows)
        initiative_fetch, element = await self.initiative_fetch(), await self.priority_element("capability")
        initiative_rows, states, teams, releases = await asyncio.gather(
            self.by_ids("/portfolioitem/capability", initiative_fetch, [p.initiative_id for p in projects if p.initiative_id]),
            self.capability_states(), self.teams(p.team_id for p in projects), self.project_releases(projects))
        parents = await self.outcome_parents(g for r in initiative_rows if (g := oid(r.get("Parent"))))
        return ProjectList(projects=projects, teams=teams, releases=releases, initiatives=[
            initiative_from_rally(r, states, element, parents.get(oid(r.get("Parent")))) for r in initiative_rows])

    async def project_detail(self, ref: str) -> ProjectDetail:
        row = await self.find_portfolio_row("portfolioitem/feature", await self.project_fetch() + ",Description", ref)
        (project,) = await self._with_health([row])
        artifact = f"/portfolioitem/feature/{project.id}"
        issue_rows, post_rows = await asyncio.gather(
            self.client.query("/hierarchicalrequirement", await self.params(
                fetch=ISSUE_FETCH, query=f"(Feature = {artifact})", order="DragAndDropRank ASC"), limit=2000),
            self.posts(artifact, order="CreationDate DESC"))
        issues = [issue_from_rally(r) for r in issue_rows]
        updates, comments = split_posts([comment_from_rally(r) for r in post_rows])
        cycles, _, users = await self.refs(issues, have_projects=[project.id])
        teams, releases = await asyncio.gather(self.teams({i.team_id for i in issues} | {project.team_id}),
                                               self.project_releases([project]))
        people = [*users, project.lead, *(u.author for u in updates), *(c.author for c in comments)]
        return ProjectDetail(project=project, description=row.get("Description") or "", issues=issues, updates=updates,
                             comments=comments, cycles=cycles, teams=teams, users=unique_users(people), releases=releases)

    async def _initiatives(self, ids: list[int]) -> InitiativeList:
        wanted = sorted(set(ids))
        base = await self.params(fetch=await self.project_fetch())
        initiative_fetch, element = await self.initiative_fetch(), await self.priority_element("capability")
        cap_rows, child_batches, states, latest = await asyncio.gather(
            self.by_ids("/portfolioitem/capability", initiative_fetch, wanted),
            asyncio.gather(*(self.client.query("/portfolioitem/feature", {**base, "query": or_query(
                [f"Parent = /portfolioitem/capability/{i}" for i in wanted[n:n + CHUNK]])}, limit=1000)
                for n in range(0, len(wanted), CHUNK))),
            self.capability_states(),
            self.latest_updates("portfolioitem/capability", wanted))
        children, parents = await asyncio.gather(self._with_health([r for batch in child_batches for r in batch]),
                                                 self.outcome_parents(g for r in cap_rows if (g := oid(r.get("Parent")))))
        releases = await self.project_releases(children)
        out: list[Initiative] = []
        for row in cap_rows:
            i = initiative_from_rally(row, states, element, parents.get(oid(row.get("Parent"))))
            active = [p.health.value for p in children if p.initiative_id == i.id and p.status_category == "started" and p.health]
            out.append(i.model_copy(update={"latest_update": latest.get(i.id), "project_health": active,
                                            "health": initiative_health(latest.get(i.id), active)}))
        return InitiativeList(initiatives=out, projects=children, releases=releases)

    async def list_initiatives(self, team_ids: list[int]) -> InitiativeList:
        """Capabilities above your teams' projects (spec assumption 12)."""
        listing = await self.list_projects(team_ids)
        ids = [p.initiative_id for p in listing.projects if p.initiative_id]
        return await self._initiatives(ids) if ids else InitiativeList(initiatives=[], projects=[])

    async def initiative_detail(self, ref: str) -> InitiativeDetail:
        row = await self.find_portfolio_row("portfolioitem/capability", await self.initiative_fetch(), ref)  # the fetch has Description
        cap_id = int(row["ObjectID"])
        listing, post_rows = await asyncio.gather(self._initiatives([cap_id]),
                                                  self.posts(f"/portfolioitem/capability/{cap_id}", order="CreationDate DESC"))
        updates, comments = split_posts([comment_from_rally(r) for r in post_rows])
        return InitiativeDetail(initiative=listing.initiatives[0], description=row.get("Description") or "",
                                projects=listing.projects, updates=updates, comments=comments, releases=listing.releases)

    async def releases(self, team_ids: list[int]) -> list[Release]:
        """PIs for timeline bands: each team's recent 12. Copies with the same name and dates merge, keeping every id."""
        teams = await self.teams(team_ids)
        all_params = [await self.params(t, fetch=RELEASE_FETCH, order="ReleaseDate DESC") for t in teams]
        batches = await asyncio.gather(*(self.client.query("/release", p, limit=12) for p in all_params))
        return merge_releases(release_from_rally(r) for batch in batches for r in batch)

    async def burnup(self, team_id: int | None, cycle_id: int | None, project_ref: str | None) -> Burnup:
        """Spec §19.9: daily scope, started and completed points of a cycle (all its sibling iterations) or of a project's
        leaf stories, from Lookback. Exactly one target."""
        today = self.clock().date()
        if project_ref is None and team_id is not None and cycle_id is not None:
            cycle, siblings = await self.cycle_siblings(await self.team(team_id), cycle_id)
            start, end = date.fromisoformat(day(cycle.start)), date.fromisoformat(end_day(cycle.end))
            # Leaf stories and defects, as the cycle legend counts them. Defects have no Children, so that test is the story's alone.
            find = {"$or": [{"_TypeHierarchy": "HierarchicalRequirement", "Children": None}, {"_TypeHierarchy": "Defect"}],
                    "Iteration": {"$in": [c.id for c in siblings]}}
        elif project_ref is not None and team_id is None and cycle_id is None:
            row = await self.find_portfolio_row("portfolioitem/feature", "ObjectID,PlannedStartDate,PlannedEndDate", project_ref)
            planned_start, planned_end = day(row.get("PlannedStartDate")), end_day(row.get("PlannedEndDate"))
            start = date.fromisoformat(planned_start) if planned_start else today - BURNUP_DEFAULT_SPAN
            end = max(date.fromisoformat(planned_end), today) if planned_end else today  # an overdue project still runs to today
            find = {"_TypeHierarchy": "HierarchicalRequirement", "_ItemHierarchy": int(row["ObjectID"]), "Children": None}
        else:
            raise BadRequest("give a team and sprint, or a feature")
        snapshots = await self.client.lookback((await self.workspace()).id, {
            "find": {**find, "_ValidTo": {"$gt": f"{start.isoformat()}T00:00:00.000Z"}},
            "fields": BURNUP_FIELDS, "hydrate": ["ScheduleState"]})
        points = series([snapshot_from_rally(o) for o in snapshots], start, end, today)
        return Burnup(start=start.isoformat(), end=end.isoformat(), points=points)

    async def _guarded_portfolio_row(self, kind: str, ref: str) -> tuple[str, dict]:
        """The project or initiative row with its tags, once the guard has passed it (D35)."""
        type_path, fetch = (("portfolioitem/feature", PROJECT_FETCH) if kind == "project"
                            else ("portfolioitem/capability", INITIATIVE_FETCH))
        row = await self.find_portfolio_row(type_path, f"{fetch},Tags", ref)
        self.guard.check_portfolio(row["Name"], oid(row["Project"]), tag_names(row.get("Tags")))
        return type_path, row

    async def set_portfolio_priority(self, kind: Literal["project", "initiative"], ref: str, data: PortfolioPatch) -> Project | Initiative:
        """D38: writes the project's or initiative's custom priority field, when Rally has one. Guarded like any other write."""
        field_kind, plural = ("feature", "features") if kind == "project" else ("capability", "capabilities")
        field = (await self.pm_priority())[field_kind]
        if field is None:
            raise BadRequest(f"This workspace has no priority field for {plural}")
        type_path, row = await self._guarded_portfolio_row(kind, ref)
        value = portfolio_priority_to_rally(data.priority, field.allowed)
        fetch = await (self.project_fetch() if kind == "project" else self.initiative_fetch())
        body = await self.client.post(f"/{type_path}/{row['ObjectID']}", {_PORTFOLIO_TYPE_KEY[kind]: {field.element: value}},
                                      {"fetch": fetch})
        written = body["OperationResult"]["Object"]
        if kind == "project":
            (project,) = await self._with_health([written])
            return project
        return (await self._initiatives([int(written["ObjectID"])])).initiatives[0]

    async def post_update(self, kind: str, ref: str, data: UpdateCreate) -> Update:
        """Spec §9.3: a discussion post with the health header and a progress/target footer."""
        type_path, row = await self._guarded_portfolio_row(kind, ref)
        text = format_update(data.health, data.html, float(row.get("PercentDoneByStoryPlanEstimate") or 0),
                             end_day(row.get("PlannedEndDate")))
        body = await self.client.post("/conversationpost/create", {"ConversationPost": {
            "Artifact": f"/{type_path}/{row['ObjectID']}", "Text": text}}, {"fetch": POST_FETCH})
        update = update_from_comment(comment_from_rally(body["CreateResult"]["Object"]))
        if update is None:
            raise RallyError(502, "Rally rewrote the update so it can no longer be read back")
        return update

    async def post_portfolio_comment(self, kind: Literal["project", "initiative"], ref: str, data: CommentCreate) -> Comment:
        """A plain discussion post on a project or initiative: the html as given, with no update header."""
        type_path, row = await self._guarded_portfolio_row(kind, ref)
        body = await self.client.post("/conversationpost/create", {"ConversationPost": {
            "Artifact": f"/{type_path}/{row['ObjectID']}", "Text": data.html}}, {"fetch": POST_FETCH})
        return comment_from_rally(body["CreateResult"]["Object"])
