"""Writes (spec §6.3). Every write passes the guard before any Rally write is made (spec §11)."""
import asyncio
import html

from ..domain import (BadRequest, Comment, CommentCreate, Issue, IssueCreate, IssuePatch, Label, RankRequest, SubIssue,
                      SubIssueCreate, SubIssuePatch, TagCreate)
from .client import RallyError
from .issues import IssueReads
from .mapping import (ISSUE_FETCH, POST_FETCH, STATUS_WRITE, SUB_ISSUE_FETCH, TYPE_KEY, TYPE_PATH, comment_from_rally,
                      issue_from_rally, issue_patch_to_rally, oid, or_query, priority_to_rally, short_ref,
                      sub_issue_from_rally, sub_issue_patch_to_rally, tag_name_clause, tag_names)


class IssueWrites(IssueReads):
    async def tag_refs(self, names: list[str]) -> list[str]:
        if not names:
            return []
        # Rally returns some names entity-escaped (an apostrophe as &#39;): match on the plain text (see tag_name_clause).
        clauses = [c for c in (tag_name_clause(n) for n in names) if c]
        rows = await self.client.query("/tag", await self.params(fetch="Name", query=or_query(clauses)), limit=200) if clauses else []
        by_name = {html.unescape(r["Name"]): f"/tag/{oid(r)}" for r in rows}
        missing = [n for n in names if n not in by_name]
        if missing:
            raise RallyError(422, f"Unknown label: {missing[0]}")
        return [by_name[n] for n in names]

    async def _demo_targets(self, project_id: int | None, cycle_id: int | None) -> None:
        """While the guard is on, a write may only point at [DEMO] projects and cycles of the demo team."""
        if not self.guard.active:
            return
        if project_id is not None:
            rows = await self.by_ids("/portfolioitem/feature", "ObjectID,Name,Project", [project_id])
            self.guard.check_project(rows[0]["Name"] if rows else None, oid(rows[0]["Project"]) if rows else None)
        if cycle_id is not None:
            rows = await self.by_ids("/iteration", "ObjectID,Project", [cycle_id])
            self.guard.check_cycle(oid(rows[0]["Project"]) if rows else None)

    async def update_issue(self, issue_id: int, patch: IssuePatch) -> Issue:
        current = issue_from_rally(await self.find_issue_row(str(issue_id)))
        self.guard.check_existing(name=current.title, tags=current.labels, team_id=current.team_id)
        changes = patch.model_dump(exclude_unset=True)
        self.guard.check_patch(changes)
        await self._demo_targets(changes.get("project_id"), changes.get("cycle_id"))
        refs = await self.tag_refs(changes["labels"]) if "labels" in changes else None
        fields = issue_patch_to_rally(patch, current.kind, refs)
        body = await self.client.post(f"/{TYPE_PATH[current.kind]}/{issue_id}", {TYPE_KEY[current.kind]: fields},
                                      {"fetch": ISSUE_FETCH})
        return issue_from_rally(body["OperationResult"]["Object"])

    async def rank_issue(self, issue_id: int, req: RankRequest) -> Issue:
        target_id = req.above if req.above is not None else req.below
        if target_id == issue_id:
            raise BadRequest("a story can't be ranked relative to itself")
        current_row, target_row = await asyncio.gather(self.find_issue_row(str(issue_id)), self.find_issue_row(str(target_id)))
        current, target = issue_from_rally(current_row), issue_from_rally(target_row)
        self.guard.check_existing(name=current.title, tags=current.labels, team_id=current.team_id)
        side = "rankAbove" if req.above is not None else "rankBelow"
        body = await self.client.post(f"/{TYPE_PATH[current.kind]}/{issue_id}", {TYPE_KEY[current.kind]: {}},
                                      {side: f"/{TYPE_PATH[target.kind]}/{target.id}", "fetch": ISSUE_FETCH})
        return issue_from_rally(body["OperationResult"]["Object"])

    async def create_issue(self, data: IssueCreate) -> Issue:
        """Creates a story (defects can't be created, spec §17)."""
        self.guard.check_team(data.team_id)
        self.guard.check_create(data.title)
        await self._demo_targets(data.project_id, data.cycle_id)
        labels = list(dict.fromkeys(data.labels))
        if self.guard.active and self.settings.demo_tag not in labels:
            labels.append(self.settings.demo_tag)
        fields: dict = {"Name": data.title, "Project": f"/project/{data.team_id}",
                        "PortfolioItem": f"/portfolioitem/feature/{data.project_id}", "Description": data.description,
                        **STATUS_WRITE[data.status]}
        if data.cycle_id is not None:
            fields["Iteration"] = f"/iteration/{data.cycle_id}"
        if data.priority:
            field, value = priority_to_rally("story", data.priority)
            fields[field] = value
        if data.assignee_id is not None:
            fields["Owner"] = f"/user/{data.assignee_id}"
        if data.estimate is not None:
            fields["PlanEstimate"] = data.estimate
        if labels:
            fields["Tags"] = [{"_ref": r} for r in await self.tag_refs(labels)]
        body = await self.client.post("/hierarchicalrequirement/create", {"HierarchicalRequirement": fields},
                                      {"fetch": ISSUE_FETCH})
        created = body["CreateResult"]["Object"]
        if data.position == "bottom":  # Rally ranks new items at the top by default
            body = await self.client.post(f"/hierarchicalrequirement/{created['ObjectID']}", {"HierarchicalRequirement": {}},
                                          {"rankTo": "BOTTOM", "fetch": ISSUE_FETCH})
            created = body["OperationResult"]["Object"]
        return issue_from_rally(created)

    async def _sub_issue_row(self, sub_id: int) -> dict:
        rows = await self.client.query("/task", await self.params(fetch=SUB_ISSUE_FETCH, query=f"(ObjectID = {int(sub_id)})"), limit=1)
        if not rows:
            raise RallyError(404, f"Task {sub_id} was not found")
        return rows[0]

    def _guard_sub_issue(self, row: dict) -> None:
        self.guard.check_existing(name=row["Name"], tags=tag_names(row.get("Tags")), team_id=oid(row["Project"]))

    async def create_sub_issue(self, issue_id: int, data: SubIssueCreate) -> SubIssue:
        parent = issue_from_rally(await self.find_issue_row(str(issue_id)))
        self.guard.check_existing(name=parent.title, tags=parent.labels, team_id=parent.team_id)
        self.guard.check_create(data.title)
        fields: dict = {"Name": data.title, "WorkProduct": f"/{TYPE_PATH[parent.kind]}/{parent.id}",
                        "Project": f"/project/{parent.team_id}", "State": "Defined"}
        if data.assignee_id is not None:
            fields["Owner"] = f"/user/{data.assignee_id}"
        if data.hours is not None:
            fields["Estimate"] = fields["ToDo"] = data.hours
        if self.guard.active:
            fields["Tags"] = [{"_ref": r} for r in await self.tag_refs([self.settings.demo_tag])]
        body = await self.client.post("/task/create", {"Task": fields}, {"fetch": SUB_ISSUE_FETCH})
        return sub_issue_from_rally(body["CreateResult"]["Object"])

    async def update_sub_issue(self, sub_id: int, patch: SubIssuePatch) -> SubIssue:
        self._guard_sub_issue(await self._sub_issue_row(sub_id))
        self.guard.check_patch(patch.model_dump(exclude_unset=True))
        body = await self.client.post(f"/task/{sub_id}", {"Task": sub_issue_patch_to_rally(patch)}, {"fetch": SUB_ISSUE_FETCH})
        return sub_issue_from_rally(body["OperationResult"]["Object"])

    async def delete_sub_issue(self, sub_id: int) -> None:
        self._guard_sub_issue(await self._sub_issue_row(sub_id))
        await self.client.delete(f"/task/{sub_id}")

    async def add_comment(self, issue_id: int, data: CommentCreate) -> Comment:
        issue = issue_from_rally(await self.find_issue_row(str(issue_id)))
        self.guard.check_existing(name=issue.title, tags=issue.labels, team_id=issue.team_id)
        body = await self.client.post("/conversationpost/create", {"ConversationPost": {
            "Artifact": f"/{TYPE_PATH[issue.kind]}/{issue.id}", "Text": data.html}}, {"fetch": POST_FETCH})
        return comment_from_rally(body["CreateResult"]["Object"])

    async def delete_comment(self, post_id: int) -> None:
        """Deletes a comment or an update (an update is a post too, planning ruling 2)."""
        rows = await self.client.query("/conversationpost", await self.params(fetch=POST_FETCH, query=f"(ObjectID = {int(post_id)})"), limit=1)
        if not rows:
            raise RallyError(404, f"Comment {post_id} was not found")
        if self.guard.active:
            path = short_ref(rows[0]["Artifact"]["_ref"])
            body = await self.client.get(path, {"fetch": "Name,Tags,Project"})
            item = next(iter(body.values()))
            if path.startswith("/portfolioitem/"):
                self.guard.check_portfolio(item["Name"], oid(item["Project"]), tag_names(item.get("Tags")))
            else:
                self.guard.check_existing(name=item["Name"], tags=tag_names(item.get("Tags")), team_id=oid(item["Project"]))
        await self.client.delete(f"/conversationpost/{post_id}")

    async def create_tag(self, data: TagCreate) -> Label:
        self.guard.check_tag_create()
        name = data.name.strip()
        clause = tag_name_clause(name)
        rows = await self.client.query("/tag", await self.params(fetch="Name", query=f"({clause})"), limit=200) if clause else []
        existing = next((r["Name"] for r in rows if html.unescape(r["Name"]) == name), None)
        if existing is not None:
            return Label(name=name)
        body = await self.client.post("/tag/create", {"Tag": {"Name": name}}, {"fetch": "Name"})
        return Label(name=html.unescape(body["CreateResult"]["Object"]["Name"]))
