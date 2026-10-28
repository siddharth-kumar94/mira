"""Synthetic Rally WSAPI objects shaped like the real responses (spec §5). No real identifiers."""
BASE = "https://rally.example/slm/webservice/v2.0"
PROJECT_ID = 9001          # the demo team
OTHER_TEAM_ID = 9002       # a real (non-demo) team
ART_ID = 9000              # an ART with both teams as children
WORKSPACE_ID = 8001
DEMO_TAG = "collabathon-demo"
ME = {"_ref": f"{BASE}/user/501", "_refObjectName": "Dana Demo", "ObjectID": 501, "DisplayName": "Dana Demo",
      "UserProfile": {"_ref": f"{BASE}/userprofile/601"}}


def ref_obj(path: str, name: str | None = None) -> dict:
    obj = {"_ref": f"{BASE}/{path}"}
    if name:
        obj["_refObjectName"] = name
    return obj


def tags(*names: str) -> dict:
    return {"Count": len(names),
            "_tagsNameArray": [{"Name": n, "_ref": f"{BASE}/tag/{7000 + i}"} for i, n in enumerate(names)]}


def rally_story(**over) -> dict:
    base = {
        "_type": "HierarchicalRequirement", "_ref": f"{BASE}/hierarchicalrequirement/1001",
        "ObjectID": 1001, "FormattedID": "US1001", "Name": "[DEMO] Example story", "ScheduleState": "In-Progress",
        "Ready": False, "c_Priority": "High", "Owner": ref_obj("user/501", "Dana Demo"),
        "CreatedBy": ref_obj("user/501", "Dana Demo"), "Iteration": ref_obj("iteration/301", "Sprint 3"),
        "Feature": ref_obj("portfolioitem/feature/201", "[DEMO] Feature A"),
        "PortfolioItem": ref_obj("portfolioitem/feature/201"), "Project": ref_obj(f"project/{PROJECT_ID}", "Team - Demo"),
        "PlanEstimate": 5.0, "Blocked": False, "BlockedReason": None, "Tags": tags(DEMO_TAG),
        "Description": "<p>Hello</p>", "DragAndDropRank": "O~~~~~~", "CreationDate": "2026-10-01T14:00:00.000Z",
        "LastUpdateDate": "2026-10-16T06:25:17.000Z", "AcceptedDate": None, "Tasks": {"Count": 1},
        "RevisionHistory": ref_obj("revisionhistory/8801"),
    }
    base.update(over)
    return base


def rally_defect(**over) -> dict:
    base = rally_story(_type="Defect", _ref=f"{BASE}/defect/1101", ObjectID=1101, FormattedID="DE1101",
                       Name="[DEMO] Example defect", Feature=None, Owner=None, Priority="High Attention",
                       DragAndDropRank="P~~~~~~")
    del base["PortfolioItem"], base["c_Priority"]
    base.update(over)
    return base


def rally_task(**over) -> dict:
    base = {
        "_type": "Task", "_ref": f"{BASE}/task/4001", "ObjectID": 4001, "FormattedID": "TA4001",
        "Name": "[DEMO] Example task", "State": "Defined", "Owner": ref_obj("user/501", "Dana Demo"), "ToDo": 3.0,
        "WorkProduct": ref_obj("hierarchicalrequirement/1001"), "Project": ref_obj(f"project/{PROJECT_ID}"),
        "Tags": tags(DEMO_TAG), "LastUpdateDate": "2026-10-16T06:25:17.000Z", "TaskIndex": 0,
    }
    base.update(over)
    return base


def rally_iteration(object_id: int, name: str, start: str, end: str, project: int = PROJECT_ID) -> dict:
    return {"_ref": f"{BASE}/iteration/{object_id}", "ObjectID": object_id, "Name": name, "StartDate": start,
            "EndDate": end, "Project": ref_obj(f"project/{project}")}


def rally_team(object_id: int, name: str, children: int = 0, parent: int | None = None, state: str = "Open") -> dict:
    return {"_ref": f"{BASE}/project/{object_id}", "ObjectID": object_id, "Name": name, "State": state,
            "Children": {"Count": children}, "Parent": ref_obj(f"project/{parent}") if parent else None}


def rally_feature(object_id: int = 201, formatted_id: str = "F201", name: str = "[DEMO] Feature A", **over) -> dict:
    base = {
        "_type": "PortfolioItem/Feature", "_ref": f"{BASE}/portfolioitem/feature/{object_id}", "ObjectID": object_id,
        "FormattedID": formatted_id, "Name": name, "State": ref_obj("state/1", "Current PI"),
        "Owner": ref_obj("user/501", "Dana Demo"), "PlannedStartDate": "2026-09-10T04:00:00.000Z",
        "PlannedEndDate": "2026-12-31T05:00:00.000Z", "ActualStartDate": None, "ActualEndDate": None,
        "PercentDoneByStoryPlanEstimate": 0.4, "LeafStoryCount": 10, "AcceptedLeafStoryCount": 4,
        "LeafStoryPlanEstimateTotal": 30.0, "AcceptedLeafStoryPlanEstimateTotal": 12.0,
        "Release": ref_obj("release/701", "PI4 2026"), "Parent": ref_obj("portfolioitem/capability/251", "[DEMO] Capability"),
        "Project": ref_obj(f"project/{PROJECT_ID}"), "c_UncommittedOpenRisk": None,
        "LastUpdateDate": "2026-10-15T10:00:00.000Z", "Description": "<p>Feature notes</p>", "Tags": tags(DEMO_TAG),
        "DragAndDropRank": "M~~~~~~", "CreationDate": "2026-08-01T14:00:00.000Z",
    }
    base.update(over)
    return base


def rally_capability(object_id: int = 251, formatted_id: str = "C251", name: str = "[DEMO] Capability", **over) -> dict:
    base = {
        "_type": "PortfolioItem/Capability", "_ref": f"{BASE}/portfolioitem/capability/{object_id}",
        "ObjectID": object_id, "FormattedID": formatted_id, "Name": name, "State": ref_obj("state/11", "Developing"),
        "Owner": ref_obj("user/502", "Sam Sample"), "PlannedStartDate": "2026-07-01T04:00:00.000Z",
        "PlannedEndDate": "2026-12-31T05:00:00.000Z", "PercentDoneByStoryPlanEstimate": 0.5,
        "DirectChildrenCount": 2, "Parent": ref_obj("portfolioitem/outcome/271", "[DEMO] Outcome"),
        "Project": ref_obj(f"project/{PROJECT_ID}"), "LastUpdateDate": "2026-10-14T10:00:00.000Z",
        "CreationDate": "2026-06-20T10:00:00.000Z", "Description": "<p>Capability notes</p>", "Tags": tags(DEMO_TAG),
    }
    base.update(over)
    return base


def rally_release(object_id: int, name: str, start: str, end: str) -> dict:
    return {"_ref": f"{BASE}/release/{object_id}", "ObjectID": object_id, "Name": name, "ReleaseStartDate": start,
            "ReleaseDate": end}


def rally_post(object_id: int, text: str, artifact: str = "hierarchicalrequirement/1001",
               created: str = "2026-10-16T09:00:00.000Z") -> dict:
    return {"_ref": f"{BASE}/conversationpost/{object_id}", "ObjectID": object_id, "Text": text,
            "User": ref_obj("user/501", "Dana Demo"), "CreationDate": created, "Artifact": ref_obj(artifact)}


def rally_revision(object_id: int, text: str, created: str = "2026-10-16T08:00:00.000Z") -> dict:
    return {"ObjectID": object_id, "Description": text, "User": ref_obj("user/501", "Dana Demo"),
            "CreationDate": created}


def operation_result(obj: dict) -> dict:
    return {"OperationResult": {"Errors": [], "Warnings": [], "Object": obj}}


def create_result(obj: dict) -> dict:
    return {"CreateResult": {"Errors": [], "Warnings": [], "Object": obj}}
