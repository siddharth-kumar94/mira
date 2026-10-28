import pytest

from app.domain import BadRequest, IssuePatch, SubIssuePatch
from app.rally.mapping import (PROJECT_FETCH, activities_from_rally, and_query, comment_from_rally, cycle_from_rally, day, end_day,
                               initiative_from_rally, initiative_status, issue_from_rally, issue_patch_to_rally,
                               or_query, pi_name, portfolio_priority_from_rally, portfolio_priority_to_rally,
                               priority_from_rally, priority_to_rally, project_from_rally, quoted, release_from_rally,
                               short_ref, status_from_rally, sub_issue_from_rally, sub_issue_patch_to_rally, tag_name_clause, tag_names, team_from_rally)
from tests.fixtures import (BASE, rally_capability, rally_defect, rally_feature, rally_iteration, rally_post,
                            rally_release, rally_revision, rally_story, rally_task, rally_team, tags)


@pytest.mark.parametrize("state, ready, in_cycle, expected", [
    ("Defined", False, False, "backlog"),
    ("Defined", True, False, "todo"),
    ("Defined", False, True, "todo"),
    ("Defined", True, True, "todo"),
    ("In-Progress", False, False, "in_progress"),
    ("In-Progress", True, True, "in_progress"),
    ("Completed", False, True, "in_review"),
    ("Accepted", False, True, "done"),
    ("Idea", False, False, "backlog"),  # a workspace-specific state before Defined
])
def test_status_from_rally(state, ready, in_cycle, expected):
    assert status_from_rally(state, ready, in_cycle) == expected


@pytest.mark.parametrize("kind, value, expected", [
    ("story", "Highest", 1), ("story", "High", 2), ("story", "Medium", 3), ("story", "Low", 4),
    ("story", None, 0), ("story", "", 0), ("story", "Whenever", 0),
    ("defect", "Resolve Immediately", 1), ("defect", "High Attention", 2), ("defect", "Normal", 3),
    ("defect", "Low", 4), ("defect", "None", 0),
])
def test_priority_from_rally(kind, value, expected):
    assert priority_from_rally(kind, value) == expected


def test_priority_to_rally():
    assert priority_to_rally("story", 1) == ("c_Priority", "Highest")
    assert priority_to_rally("defect", 3) == ("Priority", "Normal")
    assert priority_to_rally("story", 0) == ("c_Priority", None)


def test_issue_from_rally_maps_every_field():
    issue = issue_from_rally(rally_story(BlockedReason="Waiting on API", Blocked=True))
    assert issue.model_dump() == {
        "id": 1001, "key": "US1001", "kind": "story", "title": "[DEMO] Example story", "status": "in_progress",
        "priority": 2, "assignee": {"id": 501, "name": "Dana Demo"}, "creator": {"id": 501, "name": "Dana Demo"},
        "team_id": 9001, "cycle_id": 301, "project_id": 201, "estimate": 5.0, "labels": ["collabathon-demo"],
        "blocked": True, "blocked_reason": "Waiting on API", "description": "<p>Hello</p>", "rank": "O~~~~~~",
        "created_at": "2026-10-01T14:00:00.000Z", "updated_at": "2026-10-16T06:25:17.000Z", "completed_at": None,
        "sub_issue_count": 1,
    }


def test_issue_prefers_feature_ancestor_over_direct_parent():
    issue = issue_from_rally(rally_story(Feature=None, PortfolioItem={"_ref": f"{BASE}/portfolioitem/feature/205"}))
    assert issue.project_id == 205


def test_defect_uses_priority_and_has_no_project():
    issue = issue_from_rally(rally_defect(Iteration=None, ScheduleState="Defined"))
    assert issue.kind == "defect" and issue.priority == 2 and issue.project_id is None
    assert issue.status == "backlog" and issue.assignee is None


def test_sub_issue_from_rally():
    s = sub_issue_from_rally(rally_task(State="Completed", TaskIndex=2))
    assert (s.id, s.key, s.status, s.issue_id, s.team_id, s.hours, s.index) == (4001, "TA4001", "done", 1001, 9001, 3.0, 2)


def test_patch_status_backlog_clears_ready_and_cycle():
    assert issue_patch_to_rally(IssuePatch(status="backlog"), "story") == {
        "ScheduleState": "Defined", "Ready": False, "Iteration": None}


def test_patch_status_todo_sets_ready_and_keeps_cycle():
    assert issue_patch_to_rally(IssuePatch(status="todo"), "story") == {"ScheduleState": "Defined", "Ready": True}


def test_patch_every_other_field():
    patch = IssuePatch(title="[DEMO] New", status="in_review", priority=1, assignee_id=None, cycle_id=302,
                       project_id=202, estimate=8, blocked=True, blocked_reason="Vendor", description="<p>x</p>")
    assert issue_patch_to_rally(patch, "story") == {
        "Name": "[DEMO] New", "ScheduleState": "Completed", "c_Priority": "Highest", "Owner": None,
        "Iteration": "/iteration/302", "PortfolioItem": "/portfolioitem/feature/202", "PlanEstimate": 8.0,
        "Blocked": True, "BlockedReason": "Vendor", "Description": "<p>x</p>"}


def test_patch_priority_on_defect_and_project_refused():
    assert issue_patch_to_rally(IssuePatch(priority=4), "defect") == {"Priority": "Low"}
    with pytest.raises(ValueError, match="Defects can.t belong"):
        issue_patch_to_rally(IssuePatch(project_id=202), "defect")


def test_patch_labels_need_refs():
    with pytest.raises(ValueError):
        issue_patch_to_rally(IssuePatch(labels=["ux"]), "story")
    assert issue_patch_to_rally(IssuePatch(labels=["ux"]), "story", ["/tag/7005"]) == {"Tags": [{"_ref": "/tag/7005"}]}


def test_patch_validation():
    with pytest.raises(ValueError, match="Backlog"):
        IssuePatch(status="backlog", cycle_id=301)
    with pytest.raises(ValueError, match="project_id"):
        IssuePatch(project_id=None)
    assert IssuePatch(status="backlog", cycle_id=None).cycle_id is None


def test_sub_issue_patch():
    assert sub_issue_patch_to_rally(SubIssuePatch(title="[DEMO] t", status="done", assignee_id=502, hours=2)) == {
        "Name": "[DEMO] t", "State": "Completed", "Owner": "/user/502", "ToDo": 2.0}


def test_query_builders_nest_binary_and_never_double_wrap():
    assert or_query(["A = 1"]) == "(A = 1)"
    assert or_query(["A = 1", "B = 2", "C = 3"]) == "(((A = 1) OR (B = 2)) OR (C = 3))"
    assert and_query(["(A = 1) OR (B = 2)", "C = 3"]) == "(((A = 1) OR (B = 2)) AND (C = 3))"
    assert and_query([or_query(["A = 1", "B = 2"]), "C = 3"]) == "(((A = 1) OR (B = 2)) AND (C = 3))"
    with pytest.raises(ValueError):
        quoted('say "hi"')


def test_short_ref_and_day():
    assert short_ref(f"{BASE}/hierarchicalrequirement/1001") == "/hierarchicalrequirement/1001"
    assert short_ref("/defect/1") == "/defect/1"
    assert day("2026-12-31T05:00:00.000Z") == "2026-12-31" and day(None) is None


def test_team_strips_prefix_and_detects_art():
    assert team_from_rally(rally_team(9001, "Team - Data Services", parent=9000)).model_dump() == {
        "id": 9001, "name": "Data Services", "level": "team", "parent_id": 9000}
    assert team_from_rally(rally_team(9000, "Clinical ART", children=3)).level == "art"


def test_cycle_belongs_to_its_team():
    c = cycle_from_rally(rally_iteration(301, "2026 PI4 Sprint 3", "2026-10-08T04:00:00.000Z", "2026-10-22T03:59:59.000Z", project=9002))
    assert (c.id, c.team_id, c.name, c.short_name) == (301, 9002, "PI 4 · Sprint 3", "Sprint 3")


@pytest.mark.parametrize("raw, name, short", [
    ("2026 PI4 Sprint 3", "PI 4 · Sprint 3", "Sprint 3"),
    ("2026 PI3 Sprint 6 (IP Sprint)", "PI 3 · IP Sprint", "IP Sprint"),
    ("PI 4 - Sprint 12", "PI 4 · Sprint 12", "Sprint 12"),
    ("2026 pi4 sprint 2", "PI 4 · Sprint 2", "Sprint 2"),
    ("2026 PI4 Sprint 7 (IP Sprint) - extension", "PI 4 · IP Sprint · extension", "IP Sprint · extension"),
    ("2026 PI4 Sprint 3 - extension", "PI 4 · Sprint 3 · extension", "Sprint 3 · extension"),
    ("2026 PI4 Sprint 3 – Holiday cover", "PI 4 · Sprint 3 · Holiday cover", "Sprint 3 · Holiday cover"),
    ("Hardening week", "Hardening week", "Hardening week"),
    ("2026 PI4 Sprint planning", "2026 PI4 Sprint planning", "2026 PI4 Sprint planning"),
])
def test_cycle_names_split_the_year_pi_and_sprint(raw, name, short):
    c = cycle_from_rally(rally_iteration(301, raw, "2026-10-08T04:00:00.000Z", "2026-10-22T03:59:59.000Z"))
    assert (c.name, c.short_name) == (name, short)


@pytest.mark.parametrize("state, category", [
    ("Funnel", "backlog"), ("Analyzing", "backlog"), ("Roadmap", "planned"), ("Next PI", "planned"),
    ("Current PI", "started"), ("Measuring", "started"), ("Done", "completed"), ("Something new", "backlog"),
])
def test_project_status_category(state, category):
    p = project_from_rally(rally_feature(State={"_ref": f"{BASE}/state/1", "_refObjectName": state}))
    assert p.status_name == state and p.status_category == category


def test_project_from_rally():
    p = project_from_rally(rally_feature(c_UncommittedOpenRisk="Yes"))
    assert (p.key, p.lead.name, p.start, p.target, p.progress) == ("F201", "Dana Demo", "2026-09-10", "2026-12-31", 0.4)
    assert (p.issue_count, p.done_count, p.points, p.done_points) == (10, 4, 30.0, 12.0)
    assert (p.pi_id, p.initiative_id, p.team_id, p.risk) == (701, 251, 9001, True)
    assert p.health is None and p.latest_update is None


def test_project_without_state_or_risk():
    p = project_from_rally(rally_feature(State=None, c_UncommittedOpenRisk="No", PlannedEndDate=None))
    assert (p.status_name, p.status_category, p.risk, p.target) == ("No status", "backlog", False, None)


def test_initiative_status_by_state_order():
    order = {"Funnel": 1, "Discovery": 2, "Developing": 3, "Releasing": 4, "Done": 5}
    assert initiative_status("Done", order) == "completed"
    assert initiative_status("Releasing", order) == "active"
    assert initiative_status("Developing", order) == "active"
    assert initiative_status("Discovery", order) == "planned"
    assert initiative_status("", order) == "planned"
    assert initiative_status("Developing", {}) == "planned"  # no state list: nothing counts as started


def test_initiative_from_rally():
    i = initiative_from_rally(rally_capability(), {"Developing": 3})
    assert (i.key, i.status, i.status_name, i.owner.name, i.target) == ("C251", "active", "Developing", "Sam Sample", "2026-12-31")
    assert (i.project_count, i.group_id, i.group_name, i.progress) == (2, 271, "[DEMO] Outcome", 0.5)
    assert i.summary == "Capability notes"
    assert (i.rank, i.updated_at) == ("", "2026-10-14T10:00:00.000Z")
    assert i.created_at == "2026-06-20T10:00:00.000Z"  # the Activity tab's "created the initiative" line
    assert initiative_from_rally(rally_capability(DragAndDropRank="O~a"), {}).rank == "O~a"  # Manual ordering is Rally's rank
    assert (i.parent_group_id, i.parent_group_name) == (None, None)


def test_initiative_from_rally_takes_its_outcomes_parent():
    i = initiative_from_rally(rally_capability(), {}, parent_group=(281, "[DEMO] Program"))
    assert (i.group_id, i.parent_group_id, i.parent_group_name) == (271, 281, "[DEMO] Program")


def test_initiative_summary_is_the_description_as_one_line_of_text():
    """Spec §19.7: the list's second line. Tags go, entities read as text, whitespace folds, long text is cut."""
    one = initiative_from_rally(rally_capability(Description="<p>Ship&nbsp;the <b>pilot</b></p>\n<p>&lt;then&gt; measure &amp; learn</p>"), {})
    assert one.summary == "Ship the pilot <then> measure & learn"
    assert initiative_from_rally(rally_capability(Description=None), {}).summary == ""
    assert len(initiative_from_rally(rally_capability(Description="<p>" + "word " * 200 + "</p>"), {}).summary) == 300


def test_release_comment_activity():
    r = release_from_rally(rally_release(701, "PI4 2026", "2026-09-10T04:00:00.000Z", "2026-12-31T04:59:59.000Z"))
    assert (r.id, r.name, r.start, r.end, r.ids) == (701, "PI 4", "2026-09-10", "2026-12-30", [701])  # D30; the end stamp is Dec 30 at 23:59:59 local
    c = comment_from_rally(rally_post(91, "<p>Hi</p>"))
    assert (c.id, c.author.name, c.html, c.created_at) == (91, "Dana Demo", "<p>Hi</p>", "2026-10-16T09:00:00.000Z")


def test_tag_names_unescape_what_rally_escapes():
    assert tag_names({"_tagsNameArray": [{"Name": "&#39;API-2022pi4"}, {"Name": "R&amp;D &lt;x&gt;"}, {"Name": "ux"}]}) == [
        "'API-2022pi4", "R&D <x>", "ux"]
    assert tag_names(None) == []


def test_tag_name_clause_avoids_characters_rally_escapes():
    assert tag_name_clause("ux") == 'Name = "ux"' and tag_name_clause("ux", exact=False) == 'Name contains "ux"'
    # Rally's query language matches neither "'API-2022pi4" nor "&#39;API-2022pi4" (live), so ask for the plain piece.
    assert tag_name_clause("'API-2022pi4") == 'Name contains "API-2022pi4"'
    assert tag_name_clause("R&D team") == 'Name contains "D team"'
    assert tag_name_clause("'&") is None


@pytest.mark.parametrize("text, events", [
    ("Original revision", ["created the story"]),
    ("SCHEDULE STATE changed from [Defined] to [In-Progress]", ["changed status from Todo to In Progress"]),
    ("SCHEDULE STATE changed from [Completed] to [Accepted], READY changed from [true] to [false]",
     ["changed status from In Review to Done"]),
    ("READY changed from [false] to [true]", ["moved to Todo"]),
    ("READY changed from [true] to [false]", ["moved to Backlog"]),
    ("OWNER added [Dana Demo]", ["assigned to Dana Demo"]),
    ("OWNER changed from [Dana Demo] to [Sam Sample]", ["assigned to Sam Sample"]),
    ("OWNER removed [Dana Demo]", ["unassigned Dana Demo"]),
    ("PRIORITY changed from [Low] to [Highest]", ["set priority to Urgent"]),
    ("PRIORITY changed from [Normal] to [High Attention]", ["set priority to High"]),
    ("PRIORITY removed [Medium]", ["removed the priority"]),
    ("ITERATION changed from [2026 PI4 Sprint 2] to [2026 PI4 Sprint 3]", ["moved to sprint PI 4 · Sprint 3"]),
    ("ITERATION removed [2026 PI4 Sprint 3]", ["removed from sprint PI 4 · Sprint 3"]),
    ("PLAN ESTIMATE changed from [3.0] to [5.0]", ["set estimate to 5"]),
    ("PLAN ESTIMATE added [0.5]", ["set estimate to 0.5"]),
    ("PLAN ESTIMATE removed [5.0]", ["removed the estimate"]),
    ("TAGS added [collabathon-demo]", ["added label collabathon-demo"]),
    ("TAGS removed [&#39;API-2022pi4]", ["removed label 'API-2022pi4"]),
    ("NAME changed from [Old] to [New, improved]", ["changed the title"]),
    ("DESCRIPTION changed from [<p>a</p>] to [<p>b</p>]", ["updated the description"]),
    ("FEATURE changed from [F1: Old] to [F2: Linear-style Rally client]", ["moved to feature Linear-style Rally client"]),
    ("PORTFOLIO ITEM removed [F2: Linear-style Rally client]", ["removed from feature Linear-style Rally client"]),
    ("BLOCKED changed from [false] to [true]", ["marked as blocked"]),
    ("BLOCKED changed from [true] to [false]", ["marked as unblocked"]),
    # Review focus 5: dropped clauses, unknown fields and commas inside values.
    ("RANK moved up, FLOW STATE changed from [Defined] to [In-Progress], ACCEPTED DATE added [Fri Oct 16 2026]", []),
    ("RELEASE changed from [PI 3] to [PI 4], SOME NEW FIELD added [x]", []),
    ("OWNER changed from [Smith, Jo] to [Doe, Al], PLAN ESTIMATE added [2.0]", ["assigned to Doe, Al", "set estimate to 2"]),
    ("", []),
])
def test_activity_reads_in_linears_words(text, events):
    got = activities_from_rally(rally_revision(81, text))
    assert [a.text for a in got] == events
    assert [a.id for a in got] == [f"81.{n}" for n in range(len(events))]
    assert all(a.author is not None and a.author.name == "Dana Demo" for a in got)


@pytest.mark.parametrize("raw, expected", [
    ("2026 PI4", "PI 4"), ("PI4 2026", "PI 4"), ("PI 4", "PI 4"), ("2026 PI 12", "PI 12"),
    ("Q4 Planning", "Q4 Planning"), ("2026 PI4 Sprint 3", "2026 PI4 Sprint 3"), ("", ""),
])
def test_pi_name(raw, expected):
    assert pi_name(raw) == expected


@pytest.mark.parametrize("value, expected", [
    ("Urgent", 1), ("Highest", 1), ("High", 2), ("Medium", 3), ("Normal", 3), ("Low", 4), ("high", 2),
    ("Nonsense", 0), ("", 0), (None, 0),
])
def test_portfolio_priority_from_rally(value, expected):
    assert portfolio_priority_from_rally(value) == expected


@pytest.mark.parametrize("priority, allowed, expected", [
    (1, ["Highest", "High", "Medium", "Low"], "Highest"), (1, ["Low", "Urgent", "High"], "Urgent"),
    (2, ["Highest", "High", "Medium", "Low"], "High"), (3, ["High", "Normal", "Low"], "Normal"),
    (3, ["High", "Medium", "Low"], "Medium"), (4, ["High", "Low"], "Low"), (0, ["High", "Low"], ""),
])
def test_portfolio_priority_to_rally(priority, allowed, expected):
    assert portfolio_priority_to_rally(priority, allowed) == expected


def test_portfolio_priority_to_rally_refuses_a_value_the_field_lacks():
    with pytest.raises(BadRequest, match="That priority isn't available in Rally"):
        portfolio_priority_to_rally(1, ["High", "Medium", "Low"])
    with pytest.raises(BadRequest):
        portfolio_priority_to_rally(4, [])


def test_project_priority_read():
    for value, expected in (("High", 2), ("Highest", 1), ("Nonsense", 0)):
        assert project_from_rally(rally_feature(c_Priority=value), "c_Priority").priority == expected
    assert project_from_rally(rally_feature(c_Priority="High")).priority == 0  # no field detected: nothing is read
    assert initiative_from_rally(rally_capability(c_Priority="Low"), {}, "c_Priority").priority == 4
    assert initiative_from_rally(rally_capability(c_Priority="Low"), {}).priority == 0


def test_project_new_fields():
    p = project_from_rally(rally_feature(ActualEndDate="2026-10-01T04:00:00.000Z", Tags=tags("Q4", "&#39;API")))
    assert p.rank == "M~~~~~~" and p.created_at == "2026-08-01T14:00:00.000Z"
    assert p.completed_at == "2026-10-01T04:00:00.000Z" and p.labels == ["Q4", "'API"]
    bare = project_from_rally(rally_feature(DragAndDropRank=None, CreationDate=None, Tags=None))
    assert (bare.rank, bare.created_at, bare.completed_at, bare.labels) == ("", "", None, [])


def test_project_fetch_has_the_new_fields():
    assert {"DragAndDropRank", "CreationDate", "Tags"} <= set(PROJECT_FETCH.split(","))


@pytest.mark.parametrize("stamp, expected", [
    ("2026-12-05T04:59:59.000Z", "2026-12-04"),  # Rally closes a planned end at 23:59:59 local; New York in winter is UTC-5
    ("2026-10-22T03:59:59.000Z", "2026-10-21"),  # and UTC-4 in summer
    ("2026-12-31T14:59:59.000Z", "2026-12-31"),  # east of Greenwich the same stamp is still the same UTC day
    ("2026-12-31T05:00:00.000Z", "2026-12-31"),  # a start-of-day stamp is left alone
    ("2026-12-04", "2026-12-04"),
    (None, None),
])
def test_end_day_is_the_day_the_planned_end_closes(stamp, expected):
    assert end_day(stamp) == expected


def test_project_initiative_and_release_ends_use_the_closing_day():
    p = project_from_rally(rally_feature(PlannedStartDate="2026-09-20T04:00:00.000Z", PlannedEndDate="2026-12-05T04:59:59.000Z"))
    assert (p.start, p.target) == ("2026-09-20", "2026-12-04")
    assert initiative_from_rally(rally_capability(PlannedEndDate="2026-12-05T04:59:59.000Z"), {}).target == "2026-12-04"
    r = release_from_rally(rally_release(701, "2026 PI3", "2026-07-01T04:00:00.000Z", "2026-09-30T03:59:59.000Z"))
    assert (r.start, r.end) == ("2026-07-01", "2026-09-29")


@pytest.mark.parametrize("field,word", [("project_id", "feature"), ("title", "title")])
def test_a_null_field_is_named_in_rallys_word(field, word):
    from app.domain import IssuePatch
    with pytest.raises(ValueError, match=f"'{word}' cannot be null"):
        IssuePatch(**{field: None})
