#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Create or reset the [DEMO] dataset (spec §10). Idempotent: items are found by name and reset to seeded values."""
import sys
from datetime import date, timedelta

from rally_demo import NOTE, PREFIX, PROJECT, TAG, assert_demo, call, current_iteration, demo_tag_ref, q, query, short

CHAIN = [("portfolioitem/program", "PortfolioItem/Program"),
         ("portfolioitem/outcome", "PortfolioItem/Outcome"),
         ("portfolioitem/capability", "PortfolioItem/Capability")]
CHAIN_NAME = "[DEMO] Collabathon Rally client POC"
FEATURES = ["[DEMO] Linear-style Rally client", "[DEMO] Rally sync reliability"]
# (name, feature index, schedule state, plan estimate, in current sprint?)
STORIES = [
    ("[DEMO] My Work view with keyboard navigation", 0, "In-Progress", 5, True),
    ("[DEMO] Command palette (⌘K) actions", 0, "In-Progress", 3, True),
    ("[DEMO] Story editor with HTML round-trip", 0, "Defined", 5, True),
    ("[DEMO] Iteration board drag to change state", 0, "Completed", 3, True),
    ("[DEMO] Optimistic writes with rollback", 1, "Accepted", 2, True),
    ("[DEMO] Backlog drag-to-rank", 0, "Defined", 8, False),
    ("[DEMO] Poll Rally for remote changes", 1, "Defined", 3, False),
    ("[DEMO] Bulk move stories to an iteration", 0, "Defined", 5, False),
]
# (days from today to the planned start, days from today to the planned end): feature 1 overruns, so Auto health is Off track
FEATURE_DATES = [(-30, 45), (-60, -7)]
UPDATE_MARK = "Mira update"
TASKS = [("[DEMO] Fetch working set from proxy", 3), ("[DEMO] Wire J/K and S shortcuts", 2)]


def upsert(type_path: str, type_key: str, fields: dict, reset: tuple[str, ...] = ()) -> dict:
    assert_demo(fields["Name"], fields["Project"])
    rows = query(type_path, f'(Name = "{fields["Name"]}")', fetch="ObjectID,FormattedID,Name,Project,Tags")
    if rows:
        obj = rows[0]
        assert_demo(obj["Name"], short(obj["Project"]["_ref"]))
        tag_names = [t["Name"] for t in obj.get("Tags", {}).get("_tagsNameArray", [])]
        if TAG not in tag_names:
            raise RuntimeError(f"refusing to reset {obj['FormattedID']} {obj['Name']}: missing {TAG} tag")
        if reset:
            call("POST", f"/{type_path}/{obj['ObjectID']}", {type_key: {k: fields[k] for k in reset}})
            print(f"reset   {obj['FormattedID']} {fields['Name']}")
        else:
            print(f"exists  {obj['FormattedID']} {fields['Name']}")
        return obj
    obj = call("POST", f"/{type_path}/create?fetch=ObjectID,FormattedID,Name", {type_key: fields})["CreateResult"]["Object"]
    print(f"created {obj['FormattedID']} {fields['Name']}")
    return obj


def current_release(today: date) -> dict | None:
    """The demo team's release whose dates contain today."""
    day = today.isoformat()
    rows = query("release", f'((ReleaseStartDate <= "{day}") AND (ReleaseDate >= "{day}"))',
                 fetch="ObjectID,Name,ReleaseStartDate,ReleaseDate")
    return rows[0] if rows else None


def closing_day(stamp: str | None) -> str | None:
    """The day a Rally planned end closes: it stamps 23:59:59 local, i.e. 03:59:59 or 04:59:59 UTC on the next day (as the proxy's `end_day`)."""
    if not stamp:
        return None
    if stamp[14:19] == "59:59" and int(stamp[11:13]) < 12:
        return (date.fromisoformat(stamp[:10]) - timedelta(days=1)).isoformat()
    return stamp[:10]


def seed_update(feature: dict) -> None:
    """One demo update on the first feature, in the exact spec §9.3 format. Skipped when it already has one."""
    assert_demo(feature["Name"], PROJECT)
    artifact = f"/portfolioitem/feature/{feature['ObjectID']}"
    posts = query("conversationpost", f'((Artifact = {artifact}) AND (Text contains "{UPDATE_MARK}"))',
                  fetch="ObjectID", scoped=False)
    if posts:
        print(f"exists  update on {feature['FormattedID']}")
        return
    row = next(iter(call("GET", f"/portfolioitem/feature/{feature['ObjectID']}?fetch=PercentDoneByStoryPlanEstimate,PlannedEndDate").values()))
    progress = round(float(row["PercentDoneByStoryPlanEstimate"] or 0) * 100)
    target = closing_day(row["PlannedEndDate"]) or "none"
    text = (f"<p><b>{UPDATE_MARK} · On track</b></p><p>[DEMO] Seeded update: the client is on track.</p>"
            f"<p><i>progress {progress}% · target {target}</i></p>")
    call("POST", "/conversationpost/create", {"ConversationPost": {"Artifact": artifact, "Text": text}})
    print(f"created update on {feature['FormattedID']} (progress {progress}%)")


def main() -> int:
    tags = [{"_ref": demo_tag_ref(create=True)}]
    today = date.today()
    iteration = current_iteration()
    if not iteration:
        print("no current iteration in the project; cannot seed sprint stories", file=sys.stderr)
        return 1
    me = short(call("GET", "/user?fetch=ObjectID")["User"]["_ref"])
    parent = None
    for type_path, type_key in CHAIN:
        fields = {"Name": CHAIN_NAME, "Project": PROJECT, "Description": NOTE, "Tags": tags}
        if parent:
            fields["Parent"] = short(parent["_ref"])
        parent = upsert(type_path, type_key, fields)
    release = current_release(today)
    if not release:
        print("no current release; skipping PI")
    features = []
    for name, (start, end) in zip(FEATURES, FEATURE_DATES):
        fields = {"Name": name, "Project": PROJECT, "Parent": short(parent["_ref"]), "Description": NOTE, "Tags": tags,
                  "PlannedStartDate": (today + timedelta(days=start)).isoformat(),
                  "PlannedEndDate": (today + timedelta(days=end)).isoformat()}
        reset = ("PlannedStartDate", "PlannedEndDate")
        if release:
            fields["Release"] = short(release["_ref"])
            reset += ("Release",)
        features.append(upsert("portfolioitem/feature", "PortfolioItem/Feature", fields, reset=reset))
    stories = []
    for name, fi, state, estimate, in_sprint in STORIES:
        fields = {"Name": name, "Project": PROJECT, "Owner": me, "PortfolioItem": short(features[fi]["_ref"]),
                  "Iteration": short(iteration["_ref"]) if in_sprint else None, "ScheduleState": state,
                  "PlanEstimate": estimate, "Description": NOTE, "Blocked": False, "Tags": tags}
        stories.append(upsert("hierarchicalrequirement", "HierarchicalRequirement", fields,
                              reset=("Iteration", "ScheduleState", "PlanEstimate", "Owner", "Description", "Blocked", "PortfolioItem",
                                     "Tags")))
    for name, todo in TASKS:
        upsert("task", "Task", {"Name": name, "Project": PROJECT, "Owner": me, "WorkProduct": short(stories[0]["_ref"]),
                                "State": "Defined", "ToDo": todo, "Estimate": todo, "Description": NOTE, "Tags": tags},
               reset=("State", "ToDo", "Tags"))
    seed_update(features[0])
    # UI flows (composer) create extra [DEMO] stories; the seeded set is the source of truth.
    keep = {spec[0] for spec in STORIES}
    extras = query("hierarchicalrequirement", f'((Name contains "[DEMO]") AND (Tags.Name = "{TAG}"))',
                   fetch="ObjectID,FormattedID,Name,Project")
    for r in extras:
        if r["Name"].startswith(PREFIX) and r["Name"] not in keep:
            assert_demo(r["Name"], short(r["Project"]["_ref"]))
            call("DELETE", f"/hierarchicalrequirement/{r['ObjectID']}")
            print(f"removed {r['FormattedID']} {r['Name']} (not part of the seeded set)")
    backlog = [s for s, spec in zip(stories, STORIES) if not spec[4]]
    for above, below in zip(backlog, backlog[1:]):
        call("POST", f"/hierarchicalrequirement/{below['ObjectID']}?rankBelow={q(short(above['_ref']))}",
             {"HierarchicalRequirement": {}})
    print(f"backlog order reset; sprint: {iteration['Name']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
