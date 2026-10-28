"""PM-layer rules (spec §9.3, §9.4): update posts and health. Pure functions over domain objects."""
import re
from datetime import date

from .domain import Comment, Health, HealthValue, Project, Update

AT_RISK_GAP = 0.25  # spec assumption 10: more than 25 points behind the share of time elapsed
HEALTH_LABEL = {"on_track": "On track", "at_risk": "At risk", "off_track": "Off track"}
_BY_LABEL = {label.lower(): value for value, label in HEALTH_LABEL.items()}
_SEVERITY = {"no_target": 0, "on_track": 1, "at_risk": 2, "off_track": 3}
_DOT = r"(?:·|&middot;|&#183;|&#xb7;)"
# Rally may rewrite <b> as <strong>, <i> as <em>, and · as an entity; the header and footer still match.
_HEADER = re.compile(rf"^\s*<p>\s*<(?:b|strong)>\s*Mira update\s*{_DOT}\s*(on track|at risk|off track)\s*</(?:b|strong)>\s*</p>", re.I)
_FOOTER = re.compile(rf"<p>\s*<(?:i|em)>\s*progress\s+(\d{{1,3}})%\s*{_DOT}\s*target\s+(\d{{4}}-\d{{2}}-\d{{2}}|none)\s*</(?:i|em)>\s*</p>\s*$", re.I)


def format_update(health: str, html: str, progress: float, target: str | None) -> str:
    return (f"<p><b>Mira update · {HEALTH_LABEL[health]}</b></p>{html}"
            f"<p><i>progress {round(progress * 100)}% · target {target or 'none'}</i></p>")


def update_from_comment(c: Comment) -> Update | None:
    """The update a post records, or None when the post is a plain comment."""
    head = _HEADER.match(c.html)
    if not head:
        return None
    body = c.html[head.end():]
    progress = target = None
    foot = _FOOTER.search(body)
    if foot:
        body = body[:foot.start()]
        progress = int(foot.group(1)) / 100
        target = None if foot.group(2).lower() == "none" else foot.group(2)
    return Update(id=c.id, author=c.author, health=_BY_LABEL[head.group(1).lower()], html=body.strip(),
                  created_at=c.created_at, progress=progress, target=target)


def split_posts(posts: list[Comment]) -> tuple[list[Update], list[Comment]]:
    updates: list[Update] = []
    comments: list[Comment] = []
    for c in posts:
        u = update_from_comment(c)
        if u:
            updates.append(u)
        else:
            comments.append(c)
    return updates, comments


def _auto(value: HealthValue, reason: str) -> Health:
    return Health(value=value, source="auto", reason=reason)


def auto_health(*, target: str | None, start: str | None, today: date, done: bool, progress: float, blocked: int,
                risk: bool) -> Health:
    """Spec §9.4, in order: No target, Off track, At risk, On track."""
    if not target:
        return _auto("no_target", "No planned end date")
    if done:
        return _auto("on_track", "Done")
    end = date.fromisoformat(target)
    if today > end:
        return _auto("off_track", f"Past its target date ({target})")
    if start:
        begin = date.fromisoformat(start)
        span = (end - begin).days
        elapsed = 1.0 if span <= 0 else min(1.0, max(0.0, (today - begin).days / span))
        if elapsed - progress > AT_RISK_GAP:
            return _auto("at_risk", f"{round(progress * 100)}% done with {round(elapsed * 100)}% of the time gone")
    if blocked:
        return _auto("at_risk", f"{blocked} blocked {'story' if blocked == 1 else 'stories'}")
    if risk:
        return _auto("at_risk", "Flagged with an open risk")
    return _auto("on_track", "On track")


def _reported(update: Update) -> Health:
    return Health(value=update.health, source="update", reason=f"Reported {update.created_at[:10]}")


def project_health(p: Project, *, today: date, blocked: int, latest: Update | None) -> Health:
    if latest:
        return _reported(latest)
    return auto_health(target=p.target, start=p.start, today=today, done=p.status_category == "completed",
                       progress=p.progress, blocked=blocked, risk=p.risk)


def initiative_health(latest: Update | None, active: list[HealthValue]) -> Health:
    """The latest initiative update, else the worst health among its active projects (spec §9.4)."""
    if latest:
        return _reported(latest)
    if not active:
        return _auto("no_target", "No active features")
    worst = max(active, key=_SEVERITY.__getitem__)
    return _auto(worst, f"Worst of {len(active)} active feature{'s' if len(active) != 1 else ''}")
