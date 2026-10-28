"""Cycle rules (spec §19.3, planning ruling 2): points stats and the past-cycle cut. Pure functions over domain objects."""
from datetime import datetime

from .domain import Cycle, CycleStats, Issue
from .rally.mapping import iso

STARTED = ("in_progress", "in_review")


def cycle_key(c: Cycle) -> tuple[str, str, str]:
    """An ART has one iteration per child team; they are one cycle when name, start and end agree."""
    return c.name, c.start, c.end


def stats_for(cycle_ids: list[int], issues: list[Issue]) -> list[CycleStats]:
    """Points per cycle. Scope is every issue's estimate (none counts 0), started is In Progress plus In Review,
    completed is Done. One entry per id asked for, in that order."""
    stats = {i: CycleStats(cycle_id=i, scope=0, started=0, completed=0, issue_count=0) for i in cycle_ids}
    for issue in issues:
        s = stats.get(issue.cycle_id)
        if s is None:
            continue
        points = issue.estimate or 0
        s.issue_count += 1
        s.scope += points
        if issue.status in STARTED:
            s.started += points
        elif issue.status == "done":
            s.completed += points
    return list(stats.values())


def cut_cycles(cycles: list[Cycle], now: datetime, past: int) -> tuple[list[Cycle], bool]:
    """Every current and future cycle plus the `past` most recent ended ones, oldest first. The bool says whether
    older ones exist. Cycles that share a key (an ART's copies) count once."""
    ordered = sorted(cycles, key=lambda c: (c.start, c.end, c.name, c.id))
    stamp = iso(now)
    ended = [c for c in ordered if c.end < stamp]
    keys = list(dict.fromkeys(cycle_key(c) for c in ended))
    keep = set(keys[max(len(keys) - past, 0):] if past else [])
    kept = [c for c in ordered if c.end >= stamp or cycle_key(c) in keep]
    return kept, len(keys) > past
