"""Shared state and query helpers for the Rally adapter (spec §6)."""
import asyncio
import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from ..config import Settings
from ..credentials import delete_key, write_key
from ..domain import Cycle, Issue, Project, Session, SubIssue, Team, User, Workspace
from ..guard import WriteGuard
from .client import RallyClient, RallyError
from .mapping import (CYCLE_FETCH, INITIATIVE_FETCH, ISSUE_FETCH, PROJECT_FETCH, TEAM_FETCH, cycle_from_rally, iso, oid,
                      or_query, project_from_rally, quoted, short_ref, team_from_rally, user_from_rally)

log = logging.getLogger("mira")
CLOCK_SKEW = timedelta(seconds=30)
PRIORITY_RETRY = timedelta(seconds=60)  # how long a failed type-definition read counts as "no field"
PRIORITY_TYPES = {"feature": "PortfolioItem/Feature", "capability": "PortfolioItem/Capability"}
CHUNK = 50
ARTIFACT_TYPES = "HierarchicalRequirement,Defect"


@dataclass(frozen=True)
class PriorityField:
    """A custom priority field on Features or Capabilities (D38): its Rally element name and the values it allows."""
    element: str
    allowed: list[str]


def unique_users(people: Iterable[User | None]) -> list[User]:
    by_id = {u.id: u for u in people if u}
    return sorted(by_id.values(), key=lambda u: u.name.lower())


def dedupe(rows: Iterable[dict]) -> list[dict]:
    """Rows by ObjectID, first occurrence wins, order kept."""
    seen: dict[int, dict] = {}
    for row in rows:
        seen.setdefault(int(row["ObjectID"]), row)
    return list(seen.values())


class RallyBase:
    def __init__(self, client: RallyClient, settings: Settings, guard: WriteGuard,
                 clock: Callable[[], datetime] | None = None, client_factory: Callable[[str], RallyClient] | None = None):
        self.client = client
        self.settings = settings
        self.guard = guard
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self._client_factory = client_factory
        self._reset()

    def _reset(self) -> None:
        """Forget everything learned from Rally (a new key may be a different person)."""
        self._me: User | None = None
        self._profile: int | None = None
        self._workspace: Workspace | None = None
        self._teams: dict[int, Team] = {}
        self._capability_states: dict[str, int] | None = None
        self._blocked: tuple[datetime, dict[int, int]] | None = None
        self._pm_priority: dict[str, PriorityField | None] = {}  # kind -> what Rally said, kept for the session
        self._pm_priority_failed: dict[str, datetime] = {}       # kind -> when reading its type definition failed
        self._outcome_parents: dict[int, tuple[int, str] | None] = {}  # Outcome id -> its parent (a Program), or None

    async def aclose(self) -> None:
        await self.client.aclose()

    async def session(self) -> Session:
        """Spec §6.1. No Rally call when no key is set. The key itself is never part of the answer."""
        guard = self.settings.write_guard
        if not self.client.connected:
            return Session(connected=False, write_guard=guard)
        try:
            me, workspace = await asyncio.gather(self.me(), self.workspace())
        except RallyError as e:
            if e.status == 401:
                return Session(connected=False, write_guard=guard, error=e.message)
            raise
        return Session(connected=True, me=me, workspace=workspace, write_guard=guard)

    async def connect(self, api_key: str) -> Session:
        """Validate the key with Rally, save it (0600), then swap clients. A rejected key changes nothing."""
        if self._client_factory is None:
            raise RuntimeError("this adapter can't make clients")
        candidate = self._client_factory(api_key.strip())
        try:
            await candidate.get("/user", {"fetch": "ObjectID"})
        except RallyError as e:
            await candidate.aclose()
            if e.status == 401:
                raise RallyError(401, "Rally rejected that key") from None
            raise
        write_key(api_key, self.settings.mira_credentials)
        old, self.client = self.client, candidate
        await old.aclose()
        self._reset()
        return await self.session()

    async def disconnect(self) -> Session:
        """Forget the saved key. A key in .env returns when the proxy restarts."""
        delete_key(self.settings.mira_credentials)
        if self._client_factory is not None:
            old, self.client = self.client, self._client_factory("")
            await old.aclose()
        self._reset()
        return await self.session()

    def now_stamp(self, now: datetime) -> str:
        return iso(now - CLOCK_SKEW)

    async def me(self) -> User:
        if self._me is None:
            body = await self.client.get("/user", {"fetch": "ObjectID,DisplayName,UserProfile"})
            self._me = user_from_rally(body["User"])
            self._profile = oid(body["User"].get("UserProfile"))
        return self._me

    async def workspace(self) -> Workspace:
        if self._workspace is None:
            wid = self.settings.rally_workspace
            if not wid:  # connected in the app with no RALLY_WORKSPACE: use the person's default
                await self.me()
                if self._profile is None:
                    raise RallyError(422, "Rally didn't say which workspace is yours; set RALLY_WORKSPACE")
                profile = await self.client.get(f"/userprofile/{self._profile}", {"fetch": "DefaultWorkspace"})
                wid = oid(profile["UserProfile"]["DefaultWorkspace"])
            body = await self.client.get(f"/workspace/{wid}", {"fetch": "ObjectID,Name"})
            self._workspace = Workspace(id=int(wid), name=body["Workspace"]["Name"])
        return self._workspace

    async def params(self, team: Team | None = None, **extra: str) -> dict[str, str]:
        """Workspace-wide when `team` is None; else that team, with its child teams for an ART (spec D7)."""
        p = {"workspace": f"/workspace/{(await self.workspace()).id}", **extra}
        if team is not None:
            p.update(project=f"/project/{team.id}", projectScopeUp="false",
                     projectScopeDown="true" if team.level == "art" else "false")
        return p

    async def artifacts(self, query: str, team: Team | None = None, *, limit: int = 200,
                        order: str = "DragAndDropRank ASC", fetch: str = ISSUE_FETCH, pagesize: int = 200) -> list[dict]:
        params = await self.params(team, types=ARTIFACT_TYPES, fetch=fetch, query=query, order=order)
        return await self.client.query("/artifact", params, limit=limit, pagesize=pagesize)

    async def by_ids(self, path: str, fetch: str, ids: Iterable[int], **extra: str) -> list[dict]:
        """Workspace-wide lookup by ObjectID, CHUNK ids per query, run in parallel."""
        wanted = sorted({int(i) for i in ids})
        if not wanted:
            return []
        base = await self.params(fetch=fetch, **extra)
        batches = await asyncio.gather(*(
            self.client.query(path, {**base, "query": or_query([f"ObjectID = {i}" for i in wanted[n:n + CHUNK]])}, limit=CHUNK)
            for n in range(0, len(wanted), CHUNK)))
        return [row for batch in batches for row in batch]

    async def teams(self, ids: Iterable[int]) -> list[Team]:
        """Teams by id, in the order given, skipping closed or unknown projects."""
        order = list(dict.fromkeys(int(i) for i in ids))
        missing = [i for i in order if i not in self._teams]
        for row in await self.by_ids("/project", TEAM_FETCH, missing):
            if (row.get("State") or "Open") != "Closed":
                team = team_from_rally(row)
                self._teams[team.id] = team
        return [self._teams[i] for i in order if i in self._teams]

    async def _priority_field(self, type_path: str) -> PriorityField | None:
        """The first custom attribute of a portfolio type named c_Priority or Priority, with its allowed values."""
        defs = await self.client.query("/typedefinition", await self.params(
            fetch="Attributes", query=f"(TypePath = {quoted(type_path)})"), limit=1)
        attributes_ref = ((defs[0].get("Attributes") or {}).get("_ref")) if defs else None
        if not attributes_ref:
            return None
        attributes = await self.client.query(short_ref(attributes_ref), {"fetch": "ElementName,Name,Custom,AllowedValues"}, limit=1000)
        found = next((a for a in attributes if a.get("Custom") and (
            (a.get("ElementName") or "").lower() == "c_priority" or (a.get("Name") or "").lower() == "priority")), None)
        if found is None:
            return None
        values_ref = (found.get("AllowedValues") or {}).get("_ref")
        rows = await self.client.query(short_ref(values_ref), {"fetch": "StringValue"}, limit=200) if values_ref else []
        return PriorityField(found["ElementName"], [r["StringValue"] for r in rows if r.get("StringValue")])

    async def pm_priority(self) -> dict[str, PriorityField | None]:
        """D38: the priority field of Features ("feature") and Capabilities ("capability"), None where Rally has none.
        Asked of Rally's type definitions once per session. The field is optional, so a failed read (other than a rejected
        key) counts as "no field" for a minute, then is tried again."""
        now = self.clock()
        due = [k for k in PRIORITY_TYPES if k not in self._pm_priority
               and not (k in self._pm_priority_failed and now - self._pm_priority_failed[k] < PRIORITY_RETRY)]
        results = await asyncio.gather(*(self._priority_field(PRIORITY_TYPES[k]) for k in due), return_exceptions=True)
        for kind, result in zip(due, results):
            if isinstance(result, RallyError) and result.status != 401:
                log.warning("couldn't read the %s type definition, so it has no priority field for now: %s", kind, result.message)
                self._pm_priority_failed[kind] = now
            elif isinstance(result, BaseException):
                raise result
            else:
                self._pm_priority[kind] = result
                self._pm_priority_failed.pop(kind, None)
        return {kind: self._pm_priority.get(kind) for kind in PRIORITY_TYPES}

    async def outcome_parents(self, ids: Iterable[int]) -> dict[int, tuple[int, str] | None]:
        """Each Outcome's parent (Rally's Program) as (id, name), None when it has none. Kept for the session; asks Rally
        only for the ids it lacks, in one batched read. The level is optional, so a failed read (other than a rejected key)
        maps those ids to None without keeping the answer, and the next call asks again."""
        wanted = list(dict.fromkeys(int(i) for i in ids))
        missing = [i for i in wanted if i not in self._outcome_parents]
        if missing:
            try:
                rows = await self.by_ids("/portfolioitem/outcome", "ObjectID,Parent", missing)
            except RallyError as e:
                if e.status == 401:
                    raise
                log.warning("couldn't read the parents of %d outcomes, so they have none for now: %s", len(missing), e.message)
                rows = None
            if rows is not None:
                found = {int(r["ObjectID"]): r.get("Parent") for r in rows}
                for i in missing:
                    parent = found.get(i)
                    pid = oid(parent)
                    self._outcome_parents[i] = (pid, parent.get("_refObjectName") or "") if pid is not None else None
        return {i: self._outcome_parents.get(i) for i in wanted}

    async def priority_element(self, kind: str) -> str | None:
        """The Rally element of a kind's priority field ("feature" or "capability"), if there is one."""
        field = (await self.pm_priority())[kind]
        return field.element if field else None

    async def project_fetch(self) -> str:
        element = await self.priority_element("feature")
        return f"{PROJECT_FETCH},{element}" if element else PROJECT_FETCH

    async def initiative_fetch(self) -> str:
        element = await self.priority_element("capability")
        return f"{INITIATIVE_FETCH},{element}" if element else INITIATIVE_FETCH

    async def team(self, team_id: int) -> Team:
        found = await self.teams([team_id])
        if not found:
            raise RallyError(404, f"Team {team_id} was not found")
        return found[0]

    async def refs(self, issues: Iterable[Issue], sub_issues: Iterable[SubIssue] = (), *,
                   have_cycles: Iterable[int] = (), have_projects: Iterable[int] = ()) -> tuple[list[Cycle], list[Project], list[User]]:
        """The cycles, projects and people a set of issues points at, minus the ones the caller already has."""
        issues, sub_issues = list(issues), list(sub_issues)
        skip_cycles, skip_projects = set(have_cycles), set(have_projects)
        fetch, element = await self.project_fetch(), await self.priority_element("feature")
        cycle_rows, project_rows = await asyncio.gather(
            self.by_ids("/iteration", CYCLE_FETCH, [i.cycle_id for i in issues if i.cycle_id and i.cycle_id not in skip_cycles]),
            self.by_ids("/portfolioitem/feature", fetch,
                        [i.project_id for i in issues if i.project_id and i.project_id not in skip_projects]))
        people = [p for i in issues for p in (i.assignee, i.creator)] + [s.assignee for s in sub_issues]
        return [cycle_from_rally(r) for r in cycle_rows], [project_from_rally(r, element) for r in project_rows], unique_users(people)
