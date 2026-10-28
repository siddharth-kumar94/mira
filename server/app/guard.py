"""Demo-mode write guard (spec §11): only [DEMO]-labelled items in the demo team may change. Covers every write."""
from dataclasses import dataclass

GUARD_MESSAGE = "Demo mode: only [DEMO] items can be edited"


class GuardError(Exception):
    """A write the guard refused. The API answers 403 with this message."""


@dataclass(frozen=True)
class WriteGuard:
    mode: str  # "demo" or "off"
    team_id: int  # the demo team (Rally project)
    prefix: str
    tag: str

    @property
    def active(self) -> bool:
        return self.mode != "off"  # fail closed: an unknown mode guards

    def _is_demo(self, name: str | None, team_id: int | None) -> bool:
        return name is not None and name.startswith(self.prefix) and team_id == self.team_id

    def check_existing(self, *, name: str, tags: list[str], team_id: int) -> None:
        if not self.active:
            return
        if team_id != self.team_id:
            raise GuardError("Demo mode: only items in the demo team can be edited")
        if not name.startswith(self.prefix) or self.tag not in tags:
            raise GuardError(GUARD_MESSAGE)

    def check_patch(self, changes: dict) -> None:
        if not self.active:
            return
        if "title" in changes and not str(changes["title"]).startswith(self.prefix):
            raise GuardError(f"Demo mode: demo items must keep the {self.prefix.strip()} prefix")
        if "labels" in changes and self.tag not in (changes["labels"] or []):
            raise GuardError(f"Demo mode: demo items must keep the {self.tag} label")

    def check_team(self, team_id: int) -> None:
        if self.active and team_id != self.team_id:
            raise GuardError("Demo mode: new stories can only go in the demo team")

    def check_create(self, title: str) -> None:
        if self.active and not title.startswith(self.prefix):
            raise GuardError(f"Demo mode: new items need the {self.prefix.strip()} prefix")

    def check_project(self, name: str | None, team_id: int | None) -> None:
        """`name`/`team_id` describe the target project, or are None when it isn't visible."""
        if self.active and not self._is_demo(name, team_id):
            raise GuardError("Demo mode: demo stories can only move under [DEMO] features in the demo team")

    def check_cycle(self, team_id: int | None) -> None:
        if self.active and team_id != self.team_id:
            raise GuardError("Demo mode: demo stories can only move into sprints of the demo team")

    def check_portfolio(self, name: str, team_id: int | None, tags: list[str]) -> None:
        """D35: a feature or capability write needs the prefix, the demo team and the tag, like any other item."""
        if not self.active:
            return
        if team_id != self.team_id:
            raise GuardError("Demo mode: only items in the demo team can be edited")
        if not name.startswith(self.prefix) or self.tag not in tags:
            raise GuardError(f"Demo mode: only {self.prefix.strip()} features and capabilities tagged {self.tag} can change")

    def check_tag_create(self) -> None:
        if self.active:
            raise GuardError("Demo mode: labels can't be created")
