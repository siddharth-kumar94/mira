"""Burn-up series (spec §19.9): daily scope, started and completed points from a story's states over time. Pure, so it tests
without Rally; the adapter turns Lookback snapshots into `Snapshot`s. Days are UTC days."""
from datetime import date, timedelta, timezone

from .cycles import STARTED
from .domain import BurnupPoint, Snapshot


def series(snapshots: list[Snapshot], start: date, end: date, today: date) -> list[BurnupPoint]:
    """One point per day from `start` to the earlier of `end` and `today`. A story counts on a day when one of its snapshots
    is valid at the end of that day (`valid_from <= day_end < valid_to`), which is every day from the snapshot's own date up to
    the day before it closes. Scope is every story's points; started is In Progress plus In Review; completed is Done
    (planning ruling 2)."""
    last = min(today, end)
    if last < start:
        return []
    days = (last - start).days + 1
    scope, started, completed = [0.0] * days, [0.0] * days, [0.0] * days
    for snap in snapshots:
        first = max((snap.valid_from.astimezone(timezone.utc).date() - start).days, 0)
        after = days if snap.valid_to is None else min((snap.valid_to.astimezone(timezone.utc).date() - start).days, days)
        for i in range(first, after):
            scope[i] += snap.points
            if snap.status in STARTED:
                started[i] += snap.points
            elif snap.status == "done":
                completed[i] += snap.points
    return [BurnupPoint(day=(start + timedelta(days=i)).isoformat(), scope=scope[i], started=started[i], completed=completed[i])
            for i in range(days)]
