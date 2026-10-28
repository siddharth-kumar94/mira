"""Pure conversions between Rally WSAPI objects and the domain model (spec §5). No I/O."""
import html
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from ..domain import Activity, BadRequest, Comment, Cycle, Initiative, Issue, IssuePatch, Project, Release, Snapshot, SubIssue, SubIssuePatch, Team, User

Rally = dict[str, Any]

KIND_BY_TYPE = {"HierarchicalRequirement": "story", "Defect": "defect"}
TYPE_PATH = {"story": "hierarchicalrequirement", "defect": "defect"}
TYPE_KEY = {"story": "HierarchicalRequirement", "defect": "Defect"}

ISSUE_FETCH = ",".join([
    "ObjectID", "FormattedID", "Name", "ScheduleState", "Ready", "c_Priority", "Priority", "Owner", "CreatedBy",
    "Project", "Iteration", "Feature", "PortfolioItem", "PlanEstimate", "Tags", "Blocked", "BlockedReason",
    "Description", "DragAndDropRank", "CreationDate", "LastUpdateDate", "AcceptedDate", "Tasks", "RevisionHistory",
])
SUB_ISSUE_FETCH = "ObjectID,FormattedID,Name,State,Owner,ToDo,WorkProduct,Project,Tags,TaskIndex,LastUpdateDate"
TEAM_FETCH = "ObjectID,Name,Parent,Children,State"
CYCLE_FETCH = "ObjectID,Name,StartDate,EndDate,Project,PlannedVelocity"
STATS_FETCH = "ObjectID,PlanEstimate,ScheduleState,Ready,Iteration,Project"
PROJECT_FETCH = ",".join([
    "ObjectID", "FormattedID", "Name", "State", "Owner", "PlannedStartDate", "PlannedEndDate", "ActualStartDate",
    "ActualEndDate", "PercentDoneByStoryPlanEstimate", "LeafStoryCount", "AcceptedLeafStoryCount",
    "LeafStoryPlanEstimateTotal", "AcceptedLeafStoryPlanEstimateTotal", "Release", "Parent", "Project",
    "c_UncommittedOpenRisk", "LastUpdateDate", "DragAndDropRank", "CreationDate", "Tags",
])
INITIATIVE_FETCH = ("ObjectID,FormattedID,Name,State,Owner,PlannedStartDate,PlannedEndDate,"
                    "PercentDoneByStoryPlanEstimate,DirectChildrenCount,Parent,Project,LastUpdateDate,Description,DragAndDropRank,"
                    "CreationDate")
RELEASE_FETCH = "ObjectID,Name,ReleaseStartDate,ReleaseDate"
POST_FETCH = "ObjectID,Text,User,CreationDate,Artifact"
REVISION_FETCH = "ObjectID,Description,User,CreationDate"

STATUS_WRITE: dict[str, Rally] = {
    "backlog": {"ScheduleState": "Defined", "Ready": False, "Iteration": None},
    "todo": {"ScheduleState": "Defined", "Ready": True},
    "in_progress": {"ScheduleState": "In-Progress"},
    "in_review": {"ScheduleState": "Completed"},
    "done": {"ScheduleState": "Accepted"},
}
_STATUS_READ = {"In-Progress": "in_progress", "Completed": "in_review", "Accepted": "done"}
_SUB_STATUS_READ = {"Defined": "todo", "In-Progress": "in_progress", "Completed": "done"}
_SUB_STATUS_WRITE = {v: k for k, v in _SUB_STATUS_READ.items()}
_PRIORITY = {
    "story": ("c_Priority", {"Highest": 1, "High": 2, "Medium": 3, "Low": 4}),
    "defect": ("Priority", {"Resolve Immediately": 1, "High Attention": 2, "Normal": 3, "Low": 4}),
}


def oid(value: Any) -> int | None:
    """ObjectID from an object, a ref object or a ref URL. None for null."""
    if value is None:
        return None
    if isinstance(value, dict):
        if value.get("ObjectID") is not None:
            return int(value["ObjectID"])
        value = value.get("_ref")
        if value is None:
            return None
    return int(str(value).rstrip("/").rsplit("/", 1)[-1])


def ref(type_path: str, object_id: int | None) -> str | None:
    return None if object_id is None else f"/{type_path}/{object_id}"


def short_ref(value: str) -> str:
    """'/hierarchicalrequirement/1' from an absolute or short ref."""
    return "/" + value.split("/webservice/v2.0/", 1)[-1].lstrip("/")


def user_from_rally(obj: Rally | None) -> User | None:
    if not obj:
        return None
    return User(id=oid(obj), name=obj.get("_refObjectName") or obj.get("DisplayName") or "")


_ESCAPED_CHARS = re.compile(r"[&<>']")


def tag_name_clause(name: str, exact: bool = True) -> str | None:
    """A Rally query clause that finds the tag `name`. Rally returns some tag names entity-escaped (`&#39;API`), and its
    query language matches neither the plain nor the escaped form with `=` or `contains` (live finding). For a name with
    such characters, ask for the longest piece without them and let the caller compare html.unescape(Name) itself.
    None when the name is nothing but such characters."""
    if not _ESCAPED_CHARS.search(name):
        return f"Name = {quoted(name)}" if exact else f"Name contains {quoted(name)}"
    piece = max(_ESCAPED_CHARS.split(name), key=len)
    return f"Name contains {quoted(piece)}" if piece else None


def tag_names(tags: Rally | None) -> list[str]:
    """Rally returns some tag names entity-escaped in _tagsNameArray; the app shows and compares the plain text."""
    return [html.unescape(t["Name"]) for t in (tags or {}).get("_tagsNameArray", [])]


def day(value: str | None) -> str | None:
    return value[:10] if value else None


def end_day(value: str | None) -> str | None:
    """The day a planned end closes. Rally stamps an end at 23:59:59 local, which in the Americas is 03:59:59 or 04:59:59 UTC
    on the next day, so the UTC date is a day late. Only that stamp (xx:59:59 before noon UTC) steps back a day; any other
    stamp, and a bare date, keeps its date."""
    if not value:
        return None
    if len(value) >= 19 and value[14:19] == "59:59" and int(value[11:13]) < 12:
        return (datetime.fromisoformat(value[:10]) - timedelta(days=1)).date().isoformat()
    return value[:10]


def status_from_rally(schedule_state: str, ready: bool, in_cycle: bool) -> str:
    """Spec §5.2. Any workspace-specific state that isn't one of the four reads as Backlog."""
    if schedule_state == "Defined":
        return "todo" if ready or in_cycle else "backlog"
    return _STATUS_READ.get(schedule_state, "backlog")


_OPEN_END_YEAR = 9999  # Lookback closes a current snapshot at 9999-01-01


def snapshot_from_rally(o: Rally) -> Snapshot:
    """A Lookback snapshot of a story or defect as a domain Snapshot: no estimate counts 0, and the state reads as an issue status."""
    valid_to = datetime.fromisoformat(o["_ValidTo"])
    return Snapshot(id=int(o["ObjectID"]), valid_from=datetime.fromisoformat(o["_ValidFrom"]),
                    valid_to=None if valid_to.year >= _OPEN_END_YEAR else valid_to, points=o.get("PlanEstimate") or 0,
                    status=status_from_rally(o.get("ScheduleState") or "", False, False))


def priority_from_rally(kind: str, value: Any) -> int:
    """Spec §5.3: unknown values read as No priority."""
    return _PRIORITY[kind][1].get(value, 0) if isinstance(value, str) else 0


def priority_to_rally(kind: str, priority: int) -> tuple[str, str | None]:
    field, values = _PRIORITY[kind]
    by_number = {n: name for name, n in values.items()}
    return field, by_number.get(priority)


def issue_from_rally(o: Rally) -> Issue:
    kind = KIND_BY_TYPE[o["_type"]]
    project = o.get("Feature") or (o.get("PortfolioItem") if kind == "story" else None)
    cycle_id = oid(o.get("Iteration"))
    return Issue(
        id=int(o["ObjectID"]), key=o["FormattedID"], kind=kind, title=o["Name"],
        status=status_from_rally(o["ScheduleState"], bool(o.get("Ready")), cycle_id is not None),
        priority=priority_from_rally(kind, o.get(_PRIORITY[kind][0])),
        assignee=user_from_rally(o.get("Owner")), creator=user_from_rally(o.get("CreatedBy")),
        team_id=oid(o["Project"]), cycle_id=cycle_id, project_id=oid(project), estimate=o.get("PlanEstimate"),
        labels=tag_names(o.get("Tags")), blocked=bool(o.get("Blocked")), blocked_reason=o.get("BlockedReason") or "",
        description=o.get("Description") or "", rank=o.get("DragAndDropRank") or "", created_at=o["CreationDate"],
        updated_at=o["LastUpdateDate"], completed_at=o.get("AcceptedDate"),
        sub_issue_count=int((o.get("Tasks") or {}).get("Count") or 0),
    )


def stats_issue_from_rally(o: Rally) -> Issue:
    """An issue read with STATS_FETCH: only what cycle stats use (status, estimate, cycle, team); the rest is blank."""
    cycle_id = oid(o.get("Iteration"))
    return Issue(
        id=int(o["ObjectID"]), key="", kind=KIND_BY_TYPE.get(o.get("_type"), "story"), title="",
        status=status_from_rally(o["ScheduleState"], bool(o.get("Ready")), cycle_id is not None), priority=0,
        assignee=None, creator=None, team_id=oid(o["Project"]), cycle_id=cycle_id, project_id=None,
        estimate=o.get("PlanEstimate"), labels=[], blocked=False, blocked_reason="", description="", rank="",
        created_at="", updated_at="", completed_at=None, sub_issue_count=0)


def sub_issue_from_rally(o: Rally) -> SubIssue:
    return SubIssue(
        id=int(o["ObjectID"]), key=o["FormattedID"], title=o["Name"], status=_SUB_STATUS_READ.get(o["State"], "todo"),
        assignee=user_from_rally(o.get("Owner")), issue_id=oid(o["WorkProduct"]), team_id=oid(o["Project"]),
        hours=o.get("ToDo"), index=int(o.get("TaskIndex") or 0), updated_at=o["LastUpdateDate"],
    )


def issue_patch_to_rally(patch: IssuePatch, kind: str, tag_refs: list[str] | None = None) -> Rally:
    data = patch.model_dump(exclude_unset=True)
    out: Rally = {}
    if "title" in data:
        out["Name"] = data["title"]
    if "status" in data:
        out.update(STATUS_WRITE[data["status"]])
    if "priority" in data:
        field, value = priority_to_rally(kind, data["priority"])
        out[field] = value
    if "assignee_id" in data:
        out["Owner"] = ref("user", data["assignee_id"])
    if "cycle_id" in data:
        out["Iteration"] = ref("iteration", data["cycle_id"])
    if "project_id" in data:
        if kind != "story":
            raise BadRequest("Defects can't belong to a feature")
        out["PortfolioItem"] = ref("portfolioitem/feature", data["project_id"])
    if "estimate" in data:
        out["PlanEstimate"] = data["estimate"]
    if "labels" in data:
        if tag_refs is None:
            raise ValueError("resolve label names to refs before mapping labels")
        out["Tags"] = [{"_ref": r} for r in tag_refs]
    if "blocked" in data:
        out["Blocked"] = data["blocked"]
    if "blocked_reason" in data:
        out["BlockedReason"] = data["blocked_reason"]
    if "description" in data:
        out["Description"] = data["description"]
    return out


def sub_issue_patch_to_rally(patch: SubIssuePatch) -> Rally:
    data = patch.model_dump(exclude_unset=True)
    out: Rally = {}
    if "title" in data:
        out["Name"] = data["title"]
    if "status" in data:
        out["State"] = _SUB_STATUS_WRITE[data["status"]]
    if "assignee_id" in data:
        out["Owner"] = ref("user", data["assignee_id"])
    if "hours" in data:
        out["ToDo"] = data["hours"]
    return out


def quoted(value: str) -> str:
    if '"' in value:
        raise BadRequest("values may not contain double quotes")
    return f'"{value}"'


def _wrapped(clause: str) -> bool:
    """True when the whole clause sits inside one outer pair of parentheses."""
    if not (clause.startswith("(") and clause.endswith(")")):
        return False
    depth = 0
    for i, ch in enumerate(clause):
        depth += ch == "("
        depth -= ch == ")"
        if depth == 0 and i < len(clause) - 1:
            return False
    return True


def _join(clauses: list[str], op: str) -> str:
    if not clauses:
        raise ValueError("a query needs at least one clause")
    parts = [c if _wrapped(c) else f"({c})" for c in clauses]
    q = parts[0]
    for part in parts[1:]:
        q = f"({q} {op} {part})"
    return q


def or_query(clauses: list[str]) -> str:
    """Rally needs binary nesting: ((a) OR (b)) OR (c)."""
    return _join(clauses, "OR")


def and_query(clauses: list[str]) -> str:
    return _join(clauses, "AND")


def iso(dt: datetime) -> str:
    """Rally's timestamp format: 2026-10-16T06:25:17.120Z."""
    u = dt.astimezone(timezone.utc)
    return u.strftime("%Y-%m-%dT%H:%M:%S.") + f"{u.microsecond // 1000:03d}Z"


TEAM_PREFIX = "Team - "
_PROJECT_CATEGORY = {"Funnel": "backlog", "Analyzing": "backlog", "Roadmap": "planned", "Next PI": "planned",
                     "Current PI": "started", "Measuring": "started", "Done": "completed"}
_NO_RISK = {"", "none", "no", "false", "0"}


def _state_name(o: Rally) -> str:
    return (o.get("State") or {}).get("_refObjectName") or ""


def team_from_rally(o: Rally) -> Team:
    name = o["Name"]
    return Team(id=int(o["ObjectID"]), name=name.removeprefix(TEAM_PREFIX),
                level="art" if int((o.get("Children") or {}).get("Count") or 0) > 0 else "team",
                parent_id=oid(o.get("Parent")))


# "2026 PI4 Sprint 3", "2026 PI3 Sprint 6 (IP Sprint)", "2026 PI4 Sprint 7 (IP Sprint) - extension". The year is dropped: the
# cycle's dates carry it. A trailing " - <suffix>" is kept, after a dot.
_SPRINT_NAME = re.compile(r"^(?:\d{4}\s+)?PI\s*(\d+)[\s\-–:·]+Sprint\s*(\d+)\s*(\(IP Sprint\))?(?:\s*[\-–:·]\s*(\S.*))?$", re.IGNORECASE)


def cycle_names(raw: str) -> tuple[str, str]:
    """(name, short_name): "PI 4 · Sprint 3" for headers, "Sprint 3" for chips; a suffix follows both ("… · extension"). Other names pass through."""
    m = _SPRINT_NAME.match(raw.strip())
    if not m:
        return raw, raw
    short = "IP Sprint" if m.group(3) else f"Sprint {m.group(2)}"
    if m.group(4):
        short = f"{short} · {m.group(4).strip()}"
    return f"PI {m.group(1)} · {short}", short


def cycle_from_rally(o: Rally) -> Cycle:
    name, short_name = cycle_names(o["Name"])
    velocity = o.get("PlannedVelocity")
    return Cycle(id=int(o["ObjectID"]), team_id=oid(o["Project"]), name=name, short_name=short_name,
                 start=o["StartDate"], end=o["EndDate"], capacity=velocity if velocity and velocity > 0 else None)


_PORTFOLIO_PRIORITY = {"urgent": 1, "highest": 1, "high": 2, "medium": 3, "normal": 3, "low": 4}
# Ruling 16: what each Linear priority writes, in order of preference.
_PORTFOLIO_PRIORITY_WORDS = {1: ("urgent", "highest"), 2: ("high",), 3: ("medium", "normal"), 4: ("low",)}


def portfolio_priority_from_rally(value: str | None) -> int:
    """D38: a custom priority field's value in Linear's numbers. Unknown values read as No priority."""
    return _PORTFOLIO_PRIORITY.get(value.strip().lower(), 0) if isinstance(value, str) else 0


def portfolio_priority_to_rally(priority: int, allowed: list[str]) -> str:
    """The allowed value that stands for `priority` (D38). No priority writes empty."""
    if priority == 0:
        return ""
    for word in _PORTFOLIO_PRIORITY_WORDS[priority]:
        for value in allowed:
            if value.strip().lower() == word:
                return value
    raise BadRequest("That priority isn't available in Rally")


_PI_NAME = re.compile(r"^(?:\d{4}\s+PI\s*(\d+)|PI\s*(\d+)(?:\s+\d{4})?)$", re.IGNORECASE)


def pi_name(raw: str) -> str:
    """D30: "2026 PI4" and "PI4 2026" read "PI 4". Any other name passes through."""
    m = _PI_NAME.match(raw.strip())
    return f"PI {m.group(1) or m.group(2)}" if m else raw


def project_from_rally(o: Rally, priority_field: str | None = None) -> Project:
    state = _state_name(o)
    risk = o.get("c_UncommittedOpenRisk")
    return Project(
        id=int(o["ObjectID"]), key=o["FormattedID"], name=o["Name"], status_name=state or "No status",
        status_category=_PROJECT_CATEGORY.get(state, "backlog"), lead=user_from_rally(o.get("Owner")),
        start=day(o.get("PlannedStartDate")), target=end_day(o.get("PlannedEndDate")),
        progress=float(o.get("PercentDoneByStoryPlanEstimate") or 0), issue_count=int(o.get("LeafStoryCount") or 0),
        done_count=int(o.get("AcceptedLeafStoryCount") or 0), points=float(o.get("LeafStoryPlanEstimateTotal") or 0),
        done_points=float(o.get("AcceptedLeafStoryPlanEstimateTotal") or 0), pi_id=oid(o.get("Release")),
        initiative_id=oid(o.get("Parent")), team_id=oid(o["Project"]),
        risk=risk is not None and str(risk).strip().lower() not in _NO_RISK, updated_at=o["LastUpdateDate"],
        priority=portfolio_priority_from_rally(o.get(priority_field)) if priority_field else 0,
        rank=o.get("DragAndDropRank") or "", created_at=o.get("CreationDate") or "", completed_at=o.get("ActualEndDate"),
        labels=tag_names(o.get("Tags")),
    )


def initiative_status(state: str, order: dict[str, int]) -> str:
    """Spec §5.4: Done → Completed; Developing and later → Active; earlier → Planned."""
    if state == "Done":
        return "completed"
    developing, mine = order.get("Developing"), order.get(state)
    return "active" if developing is not None and mine is not None and mine >= developing else "planned"


SUMMARY_MAX = 300


def plain_summary(description: str | None) -> str:
    """Rally HTML as one line of text: tags become spaces, entities read as text, whitespace folds, then a hard cut."""
    text = html.unescape(re.sub(r"<[^>]*>", " ", description or ""))
    return " ".join(text.split())[:SUMMARY_MAX]


def initiative_from_rally(o: Rally, state_order: dict[str, int], priority_field: str | None = None,
                          parent_group: tuple[int, str] | None = None) -> Initiative:
    state = _state_name(o)
    parent = o.get("Parent")
    return Initiative(
        id=int(o["ObjectID"]), key=o["FormattedID"], name=o["Name"], status=initiative_status(state, state_order),
        status_name=state or "No status", owner=user_from_rally(o.get("Owner")), start=day(o.get("PlannedStartDate")),
        target=end_day(o.get("PlannedEndDate")), progress=float(o.get("PercentDoneByStoryPlanEstimate") or 0),
        project_count=int(o.get("DirectChildrenCount") or 0), group_id=oid(parent),
        group_name=(parent or {}).get("_refObjectName"),
        parent_group_id=parent_group[0] if parent_group else None, parent_group_name=parent_group[1] if parent_group else None,
        priority=portfolio_priority_from_rally(o.get(priority_field)) if priority_field else 0,
        summary=plain_summary(o.get("Description")), rank=o.get("DragAndDropRank") or "", updated_at=o.get("LastUpdateDate") or "",
        created_at=o.get("CreationDate") or "",
    )


def release_from_rally(o: Rally) -> Release:
    rid = int(o["ObjectID"])
    return Release(id=rid, name=pi_name(o["Name"]), start=day(o.get("ReleaseStartDate")), end=end_day(o.get("ReleaseDate")), ids=[rid])


def comment_from_rally(o: Rally) -> Comment:
    return Comment(id=int(o["ObjectID"]), author=user_from_rally(o.get("User")), html=o.get("Text") or "",
                   created_at=o["CreationDate"])


# A Rally revision joins clauses with ", ": "FIELD changed from [a] to [b]", "FIELD added [x]", "FIELD removed [x]".
# Values are bracketed and may hold commas, so a clause ends only at "]" followed by ", FIELD" or the end.
_CLAUSE = re.compile(r"(?:^|, )(?P<field>[A-Z][A-Z0-9_ ]*?) (?:changed from \[(?P<old>.*?)\] to \[(?P<new>.*?)\]"
                     r"|added \[(?P<added>.*?)\]|removed \[(?P<removed>.*?)\])(?=, [A-Z]|$)")
_STATUS_WORD = {"Defined": "Todo", "In-Progress": "In Progress", "Completed": "In Review", "Accepted": "Done"}
_PRIORITY_WORD = {"Highest": "Urgent", "Resolve Immediately": "Urgent", "High": "High", "High Attention": "High",
                  "Medium": "Medium", "Normal": "Medium", "Low": "Low"}
_READY_PHRASES = ("moved to Todo", "moved to Backlog")


def _number(text: str) -> str:
    try:
        n = float(text)
    except ValueError:
        return text
    return str(int(n)) if n.is_integer() else str(n)


def _project(text: str) -> str:
    return re.sub(r"^F\d+:\s*", "", text)


def _phrase(field: str, old: str | None, new: str | None, gone: str | None) -> str | None:
    """One revision clause in Linear's words (spec §18.10), or None when Linear has no word for the field."""
    if field == "SCHEDULE STATE":
        to, was = _STATUS_WORD.get(new or ""), _STATUS_WORD.get(old or "")
        if to is None:
            return None
        return f"changed status from {was} to {to}" if was else f"changed status to {to}"
    if field == "READY":
        return None if new is None else "moved to Todo" if new.lower() == "true" else "moved to Backlog"
    if field == "OWNER":
        return f"assigned to {new}" if new else f"unassigned {gone}" if gone else None
    if field in ("PRIORITY", "C_PRIORITY"):
        to = _PRIORITY_WORD.get(new or "")
        return f"set priority to {to}" if to else "removed the priority" if gone is not None else None
    if field == "ITERATION":
        if new:
            return f"moved to sprint {cycle_names(new)[0]}"
        return f"removed from sprint {cycle_names(gone)[0]}" if gone else None
    if field == "PLAN ESTIMATE":
        return f"set estimate to {_number(new)}" if new else "removed the estimate" if gone is not None else None
    if field == "TAGS":
        return f"added label {new}" if new else f"removed label {gone}" if gone else None
    if field == "NAME":
        return "changed the title"
    if field == "DESCRIPTION":
        return "updated the description"
    if field in ("FEATURE", "PORTFOLIO ITEM"):
        return f"moved to feature {_project(new)}" if new else f"removed from feature {_project(gone)}" if gone else None
    if field == "BLOCKED":
        return None if new is None else "marked as blocked" if new.lower() == "true" else "marked as unblocked"
    return None


def activities_from_rally(o: Rally) -> list[Activity]:
    """Spec D34: one Rally revision becomes zero or more events in Linear's words. Unknown clauses are dropped."""
    text = (o.get("Description") or "").strip()
    unescape = lambda v: None if v is None else html.unescape(v)  # noqa: E731
    if text.lower().startswith("original revision"):
        phrases = ["created the story"]
    else:
        phrases = []
        for m in _CLAUSE.finditer(text):
            new = m["new"] if m["new"] is not None else m["added"]
            phrase = _phrase(m["field"].strip(), unescape(m["old"]), unescape(new), unescape(m["removed"]))
            if phrase:
                phrases.append(phrase)
        if any(p.startswith("changed status") for p in phrases):  # the status change already says it
            phrases = [p for p in phrases if p not in _READY_PHRASES]
    author = user_from_rally(o.get("User"))
    return [Activity(id=f"{o['ObjectID']}.{n}", author=author, text=p, created_at=o["CreationDate"])
            for n, p in enumerate(phrases)]
