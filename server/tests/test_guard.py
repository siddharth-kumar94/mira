import pytest

from app.guard import GUARD_MESSAGE, GuardError, WriteGuard

DEMO = WriteGuard("demo", 9001, "[DEMO] ", "collabathon-demo")
OFF = WriteGuard("off", 9001, "[DEMO] ", "collabathon-demo")


def test_existing_item_must_be_demo_in_demo_team():
    DEMO.check_existing(name="[DEMO] a", tags=["collabathon-demo"], team_id=9001)
    with pytest.raises(GuardError, match="demo team"):
        DEMO.check_existing(name="[DEMO] a", tags=["collabathon-demo"], team_id=9002)
    with pytest.raises(GuardError) as e:
        DEMO.check_existing(name="Real", tags=["collabathon-demo"], team_id=9001)
    assert str(e.value) == GUARD_MESSAGE
    with pytest.raises(GuardError):
        DEMO.check_existing(name="[DEMO] a", tags=[], team_id=9001)


def test_patch_keeps_prefix_and_tag():
    DEMO.check_patch({"title": "[DEMO] b", "labels": ["collabathon-demo", "ux"]})
    with pytest.raises(GuardError, match="prefix"):
        DEMO.check_patch({"title": "b"})
    with pytest.raises(GuardError, match="collabathon-demo"):
        DEMO.check_patch({"labels": ["ux"]})


def test_create_needs_demo_team_and_prefix():
    DEMO.check_team(9001)
    DEMO.check_create("[DEMO] new")
    with pytest.raises(GuardError, match="demo team"):
        DEMO.check_team(9002)
    with pytest.raises(GuardError, match="prefix"):
        DEMO.check_create("new")


def test_targets_must_be_demo():
    DEMO.check_project("[DEMO] Feature", 9001)
    DEMO.check_cycle(9001)
    for name, team in [("Real feature", 9001), ("[DEMO] Feature", 9002), (None, None)]:
        with pytest.raises(GuardError, match="features"):
            DEMO.check_project(name, team)
    with pytest.raises(GuardError, match="sprints"):
        DEMO.check_cycle(9002)
    with pytest.raises(GuardError, match="sprints"):
        DEMO.check_cycle(None)


def test_portfolio_needs_demo_prefix_team_and_tag():
    DEMO.check_portfolio("[DEMO] Feature", 9001, ["collabathon-demo"])
    with pytest.raises(GuardError, match="demo team"):
        DEMO.check_portfolio("[DEMO] Feature", 9002, ["collabathon-demo"])
    with pytest.raises(GuardError, match="features and capabilities"):
        DEMO.check_portfolio("AI/ML 2026 - Agentic Platform", 9001, ["collabathon-demo"])


def test_portfolio_needs_tag():
    with pytest.raises(GuardError, match="tagged collabathon-demo"):
        DEMO.check_portfolio("[DEMO] X", 9001, [])


def test_portfolio_allows_tagged_demo():
    DEMO.check_portfolio("[DEMO] X", 9001, ["collabathon-demo"])


def test_portfolio_off_allows_anything():
    OFF.check_portfolio("Real capability", 9002, [])


def test_no_tag_creation_in_demo_mode():
    with pytest.raises(GuardError, match="labels"):
        DEMO.check_tag_create()


def test_off_allows_everything():
    OFF.check_existing(name="Real", tags=[], team_id=9002)
    OFF.check_patch({"title": "x", "labels": []})
    OFF.check_team(9002)
    OFF.check_create("x")
    OFF.check_project(None, None)
    OFF.check_cycle(None)
    OFF.check_portfolio("Real", 9002, [])
    OFF.check_tag_create()


def test_unknown_mode_fails_closed():
    assert WriteGuard("typo", 9001, "[DEMO] ", "collabathon-demo").active
