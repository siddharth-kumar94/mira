"""Shared helpers for the [DEMO] data scripts: .env loading, Rally calls, and the demo-only write guard.

Writes are allowed only in RALLY_PROJECT and only for items whose name starts with "[DEMO] ".
"""
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "[DEMO] "
TAG = "collabathon-demo"
NOTE = "<p><b>DEMO data</b> for the Rally/Linear collabathon POC. Safe to delete.</p>"


def load_env() -> dict[str, str]:
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip("'\"")
    return env


ENV = load_env()
BASE = ENV.get("RALLY_BASE_URL", "https://rally1.rallydev.com/slm/webservice/v2.0")
PROJECT = f"/project/{ENV['RALLY_PROJECT']}"
SCOPE = f"project={PROJECT}&projectScopeUp=false&projectScopeDown=false"


def call(method: str, path: str, body: dict | None = None) -> dict:
    url = path if path.startswith("http") else BASE + path
    req = urllib.request.Request(
        url, method=method, data=None if body is None else json.dumps(body).encode(),
        headers={"ZSESSIONID": ENV["RALLY_API_KEY"], "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.load(r)
    res = next(iter(j.values())) if len(j) == 1 else j
    if isinstance(res, dict) and res.get("Errors"):
        raise RuntimeError(f"{method} {path}: {'; '.join(res['Errors'])}")
    return j


def q(s: str) -> str:
    return urllib.parse.quote(s)


def short(ref: str) -> str:
    return ref.split("/webservice/v2.0", 1)[-1]


def assert_demo(name: str, project: str = PROJECT) -> None:
    if not name.startswith(PREFIX):
        raise RuntimeError(f"refusing write without {PREFIX!r} prefix: {name}")
    if project != PROJECT:
        raise RuntimeError(f"refusing write outside {PROJECT}: {project}")


def query(type_path: str, query_str: str = "", fetch: str = "ObjectID,FormattedID,Name",
          order: str | None = None, scoped: bool = True) -> list[dict]:
    params = [SCOPE] if scoped else []
    params += [f"fetch={fetch}", "pagesize=200"]
    if query_str:
        params.append(f"query={q(query_str)}")
    if order:
        params.append(f"order={q(order)}")
    return call("GET", f"/{type_path}?{'&'.join(params)}")["QueryResult"]["Results"]


def demo_tag_ref(create: bool = False) -> str | None:
    rows = query("tag", f'(Name = "{TAG}")', fetch="Name", scoped=False)
    if rows:
        return short(rows[0]["_ref"])
    if not create:
        return None
    return short(call("POST", "/tag/create", {"Tag": {"Name": TAG}})["CreateResult"]["Object"]["_ref"])


def current_iteration() -> dict | None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    rows = query("iteration", f'((StartDate <= "{now}") AND (EndDate >= "{now}"))', fetch="ObjectID,Name,StartDate,EndDate")
    return rows[0] if rows else None
