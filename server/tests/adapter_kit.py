"""Builds a RallyAdapter over a FakeClient with the routes every adapter call needs."""
from datetime import datetime, timezone

from app.config import Settings
from app.rally.adapter import RallyAdapter
from tests.fake_client import FakeClient
from tests.fixtures import BASE, ME, PROJECT_ID, WORKSPACE_ID

NOW = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)


_attribute_ids = iter(range(5000, 6000))


def attribute(element: str, name: str, *, custom: bool = True, allowed: tuple[str, ...] = ()) -> dict:
    """A type-definition attribute. `_allowed` is read by `typedefs` (and is no part of a Rally answer)."""
    n = next(_attribute_ids)
    return {"_ref": f"{BASE}/attributedefinition/{n}", "ElementName": element, "Name": name, "Custom": custom,
            "AllowedValues": {"_ref": f"{BASE}/attributedefinition/{n}/AllowedValues", "Count": len(allowed)},
            "_allowed": list(allowed)}


def priority_attribute(*allowed: str) -> dict:
    return attribute("c_Priority", "Priority", allowed=allowed)


def typedefs(client: FakeClient, feature: list[dict] = (), capability: list[dict] = ()) -> FakeClient:
    """The type definitions of Feature and Capability, with the given attributes."""
    for type_id, type_path, attributes in ((101, "PortfolioItem/Feature", feature), (102, "PortfolioItem/Capability", capability)):
        client.on("QUERY", "/typedefinition", [{"ObjectID": type_id, "Attributes": {"_ref": f"{BASE}/typedefinition/{type_id}/Attributes"}}],
                  query_has=f'"{type_path}"')
        client.on("QUERY", f"/typedefinition/{type_id}/Attributes", [{k: v for k, v in a.items() if k != "_allowed"} for a in attributes])
        for a in attributes:
            client.on("QUERY", a["AllowedValues"]["_ref"].removeprefix(BASE),
                      [{"StringValue": v} for v in ("", *a["_allowed"])])  # Rally lists a blank choice first
    return client


def standard(client: FakeClient, feature: list[dict] = (), capability: list[dict] = ()) -> FakeClient:
    """`/user` (me), the workspace name and the type definitions (no attributes unless given)."""
    typedefs(client, feature, capability)
    client.on("GET", "/user", {"User": ME})
    client.on("GET", f"/workspace/{WORKSPACE_ID}", {"Workspace": {"ObjectID": WORKSPACE_ID, "Name": "Demo Workspace"}})
    return client


def make_adapter(client: FakeClient, clock=None, factory=None, tmp_credentials=None) -> RallyAdapter:
    extra = {"mira_credentials": tmp_credentials} if tmp_credentials is not None else {}
    settings = Settings(_env_file=None, rally_api_key="k", rally_workspace=WORKSPACE_ID, rally_project=PROJECT_ID, **extra)
    return RallyAdapter(client, settings, clock=clock or (lambda: NOW), client_factory=factory)
