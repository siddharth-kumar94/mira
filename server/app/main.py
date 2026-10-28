"""FastAPI app: the domain API in front of the Rally adapter (spec §6)."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .credentials import read_key
from .domain import (BadRequest, Bootstrap, Burnup, Changes, Comment, CommentCreate, CycleDetail, CycleList, Initiative, InitiativeDetail, InitiativeList, Issue,
                     IssueCreate, IssueDetail, IssuePage, IssuePatch, Label, PortfolioPatch, Project, ProjectDetail, ProjectList,
                     RankRequest, Release, SearchResult, Session, SessionCreate, SubIssue, SubIssueCreate, SubIssuePatch, TagCreate, TeamLoad,
                     Update, UpdateCreate, User)
from .rally.adapter import RallyAdapter
from .rally.client import RallyClient, RallyError

log = logging.getLogger("mira")
OK = {"ok": True}


def parse_ids(text: str) -> list[int]:
    """'1,2,3' → [1, 2, 3]. Anything else is a 422."""
    try:
        return [int(part) for part in text.split(",") if part.strip()]
    except ValueError:
        raise BadRequest("teams must be a comma-separated list of IDs") from None


def build_adapter(settings: Settings) -> RallyAdapter:
    def make_client(key: str) -> RallyClient:
        return RallyClient(settings.rally_base_url, key, timeout=settings.rally_timeout_s,
                           max_concurrency=settings.rally_max_concurrency)

    key = read_key(settings.mira_credentials) or settings.rally_api_key  # spec D14: the app's key, else .env
    return RallyAdapter(make_client(key), settings, client_factory=make_client)


def create_app(adapter=None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.adapter = adapter or build_adapter(Settings())
        yield
        await app.state.adapter.aclose()

    app = FastAPI(title="Mira proxy", lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])

    @app.exception_handler(RallyError)
    async def rally_error(_: Request, e: RallyError) -> JSONResponse:
        return JSONResponse({"error": e.message}, status_code=e.status)

    @app.exception_handler(BadRequest)
    async def bad_request(_: Request, e: BadRequest) -> JSONResponse:
        return JSONResponse({"error": str(e)}, status_code=422)

    @app.exception_handler(ValueError)
    async def unexpected_value(request: Request, e: ValueError) -> JSONResponse:
        """Not deliberate input validation: bad Rally data or a bug. Log it; keep the message out of the response."""
        log.exception("unexpected ValueError on %s %s", request.method, request.url.path)
        return JSONResponse({"error": "Something went wrong reading Rally data"}, status_code=500)

    def rally(request: Request) -> RallyAdapter:
        return request.app.state.adapter

    @app.get("/api/health")
    async def health() -> dict:
        return OK

    # ---------- session (spec §6.1) ----------
    @app.get("/api/session", response_model=Session)
    async def get_session(request: Request):
        return await rally(request).session()

    @app.post("/api/session", response_model=Session)
    async def connect(request: Request, body: SessionCreate):
        return await rally(request).connect(body.api_key)

    @app.delete("/api/session", response_model=Session)
    async def disconnect(request: Request):
        return await rally(request).disconnect()

    # ---------- reads (spec §6.2) ----------
    @app.get("/api/bootstrap", response_model=Bootstrap)
    async def bootstrap(request: Request):
        return await rally(request).bootstrap()

    @app.get("/api/teams/{team_id}", response_model=TeamLoad)
    async def team_load(request: Request, team_id: int):
        return await rally(request).team_load(team_id)

    @app.get("/api/teams/{team_id}/issues", response_model=IssuePage)
    async def team_issues(request: Request, team_id: int, cursor: int = 1):
        return await rally(request).team_issues(team_id, cursor)

    @app.get("/api/teams/{team_id}/cycles", response_model=CycleList)
    async def team_cycles(request: Request, team_id: int, past: int = 2):
        return await rally(request).team_cycles(team_id, past)

    @app.get("/api/teams/{team_id}/cycles/{cycle_id}", response_model=CycleDetail)
    async def cycle_detail(request: Request, team_id: int, cycle_id: int):
        return await rally(request).cycle_detail(team_id, cycle_id)

    @app.get("/api/burnup", response_model=Burnup)
    async def burnup(request: Request, team: int | None = None, cycle: int | None = None, project: str | None = None):
        return await rally(request).burnup(team, cycle, project)

    @app.get("/api/changes", response_model=Changes)
    async def changes(request: Request, since: str, teams: str = ""):
        return await rally(request).changes(since, parse_ids(teams))

    @app.get("/api/issues/{ref}", response_model=IssueDetail)
    async def get_issue(request: Request, ref: str):
        return await rally(request).get_issue(ref)

    @app.get("/api/search", response_model=SearchResult)
    async def search(request: Request, q: str):
        return await rally(request).search(q)

    @app.get("/api/users", response_model=list[User])
    async def users(request: Request, q: str):
        return await rally(request).users(q)

    @app.get("/api/labels", response_model=list[str])
    async def labels(request: Request, q: str = ""):
        return await rally(request).labels(q)

    @app.get("/api/projects", response_model=ProjectList)
    async def projects(request: Request, teams: str = "", initiative: int | None = None):
        return await rally(request).list_projects(parse_ids(teams), initiative)

    @app.get("/api/projects/{ref}", response_model=ProjectDetail)
    async def project(request: Request, ref: str):
        return await rally(request).project_detail(ref)

    @app.get("/api/initiatives", response_model=InitiativeList)
    async def initiatives(request: Request, teams: str = ""):
        return await rally(request).list_initiatives(parse_ids(teams))

    @app.get("/api/initiatives/{ref}", response_model=InitiativeDetail)
    async def initiative(request: Request, ref: str):
        return await rally(request).initiative_detail(ref)

    @app.get("/api/releases", response_model=list[Release])
    async def releases(request: Request, teams: str = ""):
        return await rally(request).releases(parse_ids(teams))

    # ---------- writes (spec §6.3) ----------
    @app.post("/api/issues", response_model=Issue, status_code=201)
    async def create_issue(request: Request, data: IssueCreate):
        return await rally(request).create_issue(data)

    @app.patch("/api/issues/{issue_id}", response_model=Issue)
    async def update_issue(request: Request, issue_id: int, patch: IssuePatch):
        return await rally(request).update_issue(issue_id, patch)

    @app.post("/api/issues/{issue_id}/rank", response_model=Issue)
    async def rank_issue(request: Request, issue_id: int, req: RankRequest):
        return await rally(request).rank_issue(issue_id, req)

    @app.post("/api/issues/{issue_id}/sub-issues", response_model=SubIssue, status_code=201)
    async def create_sub_issue(request: Request, issue_id: int, data: SubIssueCreate):
        return await rally(request).create_sub_issue(issue_id, data)

    @app.patch("/api/sub-issues/{sub_id}", response_model=SubIssue)
    async def update_sub_issue(request: Request, sub_id: int, patch: SubIssuePatch):
        return await rally(request).update_sub_issue(sub_id, patch)

    @app.delete("/api/sub-issues/{sub_id}")
    async def delete_sub_issue(request: Request, sub_id: int):
        await rally(request).delete_sub_issue(sub_id)
        return OK

    @app.post("/api/issues/{issue_id}/comments", response_model=Comment, status_code=201)
    async def add_comment(request: Request, issue_id: int, data: CommentCreate):
        return await rally(request).add_comment(issue_id, data)

    @app.delete("/api/comments/{post_id}")
    async def delete_comment(request: Request, post_id: int):
        await rally(request).delete_comment(post_id)
        return OK

    @app.post("/api/tags", response_model=Label, status_code=201)
    async def create_tag(request: Request, data: TagCreate):
        return await rally(request).create_tag(data)

    @app.post("/api/projects/{ref}/updates", response_model=Update, status_code=201)
    async def project_update(request: Request, ref: str, data: UpdateCreate):
        return await rally(request).post_update("project", ref, data)

    @app.post("/api/initiatives/{ref}/updates", response_model=Update, status_code=201)
    async def initiative_update(request: Request, ref: str, data: UpdateCreate):
        return await rally(request).post_update("initiative", ref, data)

    @app.patch("/api/projects/{ref}", response_model=Project)
    async def project_priority(request: Request, ref: str, data: PortfolioPatch):
        return await rally(request).set_portfolio_priority("project", ref, data)

    @app.patch("/api/initiatives/{ref}", response_model=Initiative)
    async def initiative_priority(request: Request, ref: str, data: PortfolioPatch):
        return await rally(request).set_portfolio_priority("initiative", ref, data)

    @app.post("/api/projects/{ref}/comments", response_model=Comment, status_code=201)
    async def project_comment(request: Request, ref: str, data: CommentCreate):
        return await rally(request).post_portfolio_comment("project", ref, data)

    @app.post("/api/initiatives/{ref}/comments", response_model=Comment, status_code=201)
    async def initiative_comment(request: Request, ref: str, data: CommentCreate):
        return await rally(request).post_portfolio_comment("initiative", ref, data)

    return app


app = create_app()
