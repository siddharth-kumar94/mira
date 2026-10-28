"""Domain model shared by the API and the Rally adapter (spec §5). Nothing here knows Rally's shapes (D2)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Status = Literal["backlog", "todo", "in_progress", "in_review", "done"]
SubStatus = Literal["todo", "in_progress", "done"]
Priority = Literal[0, 1, 2, 3, 4]  # Linear's numbers: 0 none, 1 urgent, 2 high, 3 medium, 4 low
IssueKind = Literal["story", "defect"]
HealthValue = Literal["on_track", "at_risk", "off_track", "no_target"]
ReportedHealth = Literal["on_track", "at_risk", "off_track"]
ProjectCategory = Literal["backlog", "planned", "started", "completed"]
InitiativeStatus = Literal["planned", "active", "completed"]


class BadRequest(ValueError):
    """A deliberate input error (a malformed ID, cursor or query value): the API answers 422 with its message.
    Any other ValueError is a bug or bad upstream data and answers 500."""


class User(BaseModel):
    id: int
    name: str


class Workspace(BaseModel):
    id: int
    name: str


class Team(BaseModel):
    id: int
    name: str
    level: Literal["team", "art"]
    parent_id: int | None


class Cycle(BaseModel):
    id: int
    team_id: int
    name: str
    short_name: str
    start: str
    end: str
    capacity: float | None = None  # PlannedVelocity when it is above 0


class CycleStats(BaseModel):
    cycle_id: int
    scope: float
    started: float
    completed: float
    issue_count: int


class Snapshot(BaseModel):
    """One story's state over a span of time (a Lookback snapshot). `valid_to` is None while it is still current."""
    id: int
    valid_from: datetime
    valid_to: datetime | None
    points: float
    status: Status


class BurnupPoint(BaseModel):
    day: str
    scope: float
    started: float
    completed: float


class Burnup(BaseModel):
    start: str
    end: str
    points: list[BurnupPoint]


class Health(BaseModel):
    value: HealthValue
    source: Literal["update", "auto"]
    reason: str


class Update(BaseModel):
    id: int
    author: User | None
    health: ReportedHealth
    html: str
    created_at: str
    progress: float | None  # 0..1, as it was when posted
    target: str | None


class Comment(BaseModel):
    id: int
    author: User | None
    html: str
    created_at: str


class Activity(BaseModel):
    id: str
    author: User | None
    text: str
    created_at: str


class Label(BaseModel):
    name: str


class Project(BaseModel):
    id: int
    key: str
    name: str
    status_name: str
    status_category: ProjectCategory
    lead: User | None
    start: str | None
    target: str | None
    progress: float
    issue_count: int
    done_count: int
    points: float
    done_points: float
    pi_id: int | None
    initiative_id: int | None
    team_id: int
    risk: bool
    updated_at: str
    health: Health | None = None
    latest_update: Update | None = None
    priority: Priority = 0  # 0 when Rally has no priority field for projects (D38)
    rank: str = ""
    created_at: str = ""
    completed_at: str | None = None
    labels: list[str] = []


class Initiative(BaseModel):
    id: int
    key: str
    name: str
    status: InitiativeStatus
    status_name: str
    owner: User | None
    start: str | None
    target: str | None
    progress: float
    project_count: int
    group_id: int | None  # the Outcome (the capability's parent)
    group_name: str | None
    parent_group_id: int | None = None  # the Outcome's parent: Rally's Program, the "Initiative" grouping
    parent_group_name: str | None = None
    health: Health | None = None
    latest_update: Update | None = None
    project_health: list[HealthValue] = []
    priority: Priority = 0  # 0 when Rally has no priority field for initiatives (D38)
    summary: str = ""  # the description as one line of plain text, for the list's second line (§19.7)
    rank: str = ""  # Rally's DragAndDropRank: the list's Manual ordering
    updated_at: str = ""
    created_at: str = ""  # the Activity tab's "created the initiative · Oct 16" line (§19.6–19.7)


class Release(BaseModel):
    """A PI. Each Rally team has its own copy; `id` is the first copy's, `ids` every copy merged into this one."""
    id: int
    name: str
    start: str | None
    end: str | None
    ids: list[int] = []


class Issue(BaseModel):
    id: int
    key: str
    kind: IssueKind
    title: str
    status: Status
    priority: Priority
    assignee: User | None
    creator: User | None
    team_id: int
    cycle_id: int | None
    project_id: int | None
    estimate: float | None
    labels: list[str]
    blocked: bool
    blocked_reason: str
    description: str
    rank: str
    created_at: str
    updated_at: str
    completed_at: str | None
    sub_issue_count: int


class SubIssue(BaseModel):
    id: int
    key: str
    title: str
    status: SubStatus
    assignee: User | None
    issue_id: int
    team_id: int
    hours: float | None
    index: int
    updated_at: str


# ---------- responses ----------
class Session(BaseModel):
    connected: bool
    me: User | None = None
    workspace: Workspace | None = None
    error: str | None = None


class Bootstrap(BaseModel):
    me: User
    workspace: Workspace
    teams: list[Team]
    issues: list[Issue]
    sub_issues: list[SubIssue]
    cycles: list[Cycle]
    projects: list[Project]
    users: list[User]
    server_time: str
    project_priority: bool = False     # Rally has a priority field on Features (D38)
    initiative_priority: bool = False  # ... on Capabilities


class TeamLoad(BaseModel):
    team: Team
    issues: list[Issue]
    cycles: list[Cycle]
    projects: list[Project]
    users: list[User]
    member_ids: list[int]
    server_time: str
    child_teams: list[Team] = []  # an ART's open descendant teams, for names and scope


class IssuePage(BaseModel):
    issues: list[Issue]
    next_cursor: int | None
    cycles: list[Cycle]
    projects: list[Project]
    users: list[User]


class Changes(BaseModel):
    issues: list[Issue]
    sub_issues: list[SubIssue]
    cycles: list[Cycle]
    projects: list[Project]
    users: list[User]
    server_time: str


class IssueDetail(BaseModel):
    issue: Issue
    sub_issues: list[SubIssue]
    comments: list[Comment]
    activity: list[Activity]
    cycles: list[Cycle]
    projects: list[Project]
    users: list[User]


class SearchResult(BaseModel):
    issues: list[Issue]
    teams: list[Team]
    projects: list[Project]


class ProjectList(BaseModel):
    projects: list[Project]
    initiatives: list[Initiative]
    teams: list[Team]
    #: The PIs the projects point at (every team copy merged), so each `pi_id` resolves.
    releases: list[Release] = []


class ProjectDetail(BaseModel):
    project: Project
    description: str
    issues: list[Issue]
    updates: list[Update]
    comments: list[Comment]
    cycles: list[Cycle]
    teams: list[Team]
    users: list[User]
    releases: list[Release] = []


class InitiativeList(BaseModel):
    initiatives: list[Initiative]
    projects: list[Project]
    releases: list[Release] = []


class InitiativeDetail(BaseModel):
    initiative: Initiative
    description: str
    projects: list[Project]
    updates: list[Update]
    comments: list[Comment]
    releases: list[Release] = []


# ---------- requests ----------
# The 422 toast names a field in Rally's word, not the API field's name.
_FIELD_WORD = {"project_id": "feature", "cycle_id": "sprint", "assignee_id": "assignee"}


def _reject_nulls(model: BaseModel, fields: tuple[str, ...]) -> None:
    for name in model.model_fields_set:
        if name in fields and getattr(model, name) is None:
            raise ValueError(f"'{_FIELD_WORD.get(name, name)}' cannot be null")


class IssuePatch(BaseModel):
    """Only fields that are present change. `null` clears assignee, cycle or estimate."""

    model_config = ConfigDict(extra="forbid")
    title: str | None = None
    status: Status | None = None
    priority: Priority | None = None
    assignee_id: int | None = None
    cycle_id: int | None = None
    project_id: int | None = None
    estimate: float | None = None
    labels: list[str] | None = None
    blocked: bool | None = None
    blocked_reason: str | None = None
    description: str | None = None

    @model_validator(mode="after")
    def valid(self) -> "IssuePatch":
        _reject_nulls(self, ("title", "status", "priority", "project_id", "labels", "blocked", "blocked_reason",
                             "description"))  # a story always needs a project (D15)
        if self.status == "backlog" and self.cycle_id is not None:
            raise ValueError("a Backlog story can't be in a sprint")
        return self


class IssueCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    team_id: int
    title: str = Field(min_length=1)
    project_id: int
    status: Status = "backlog"
    priority: Priority = 0
    assignee_id: int | None = None
    labels: list[str] = []
    cycle_id: int | None = None
    estimate: float | None = None
    description: str = ""
    position: Literal["top", "bottom"] = "top"

    @model_validator(mode="after")
    def valid(self) -> "IssueCreate":
        if self.status == "backlog" and self.cycle_id is not None:
            raise ValueError("a Backlog story can't be in a sprint")
        return self


class RankRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    above: int | None = None
    below: int | None = None

    @model_validator(mode="after")
    def exactly_one_side(self) -> "RankRequest":
        if (self.above is None) == (self.below is None):
            raise ValueError("give exactly one of 'above' or 'below'")
        return self


class SubIssueCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1)
    assignee_id: int | None = None
    hours: float | None = None


class SubIssuePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = None
    status: SubStatus | None = None
    assignee_id: int | None = None
    hours: float | None = None

    @model_validator(mode="after")
    def valid(self) -> "SubIssuePatch":
        _reject_nulls(self, ("title", "status"))
        return self


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    html: str = Field(min_length=1)


class UpdateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    health: ReportedHealth
    html: str = ""


class PortfolioPatch(BaseModel):
    """D38: priority is the one field of a project or initiative that Mira edits."""
    model_config = ConfigDict(extra="forbid")
    priority: Priority


class TagCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=255)


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = Field(min_length=1)


class CycleList(BaseModel):
    cycles: list[Cycle]
    stats: list[CycleStats]
    has_older: bool


class CycleDetail(BaseModel):
    cycle: Cycle
    siblings: list[Cycle]
    issues: list[Issue]
    projects: list[Project]
    users: list[User]
    teams: list[Team]
