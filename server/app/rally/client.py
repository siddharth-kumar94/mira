"""Thin async client for Rally WSAPI v2.0: API-key auth, timeout, concurrency cap, error envelope, paging, and one
retry on concurrency conflicts (spec §6.4)."""
import asyncio
import logging
from typing import Any

import httpx

NOT_CONNECTED = "Not connected to Rally"
_CONFLICT = "concurrency conflict"
WSAPI_PATH = "/slm/webservice/v2.0"
LOOKBACK_PATH = "/analytics/v2.0/service/rally"
LOOKBACK_PAGE = 20000
LOOKBACK_MAX = 100000
LOOKBACK_SORT = {"_ValidFrom": 1, "ObjectID": 1}
BURNUP_UNAVAILABLE = "Burn-up unavailable"


class RallyError(Exception):
    """A Rally failure the API turns into an HTTP status with Rally's message."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


log = logging.getLogger("mira")


def _unavailable(cause: str) -> RallyError:
    log.warning("Lookback failed: %s", cause)
    return RallyError(502, BURNUP_UNAVAILABLE)


class RallyClient:
    def __init__(self, base_url: str, api_key: str, *, timeout: float = 15.0, max_concurrency: int = 4,
                 transport: httpx.AsyncBaseTransport | None = None):
        self._api_key = api_key
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/") + "/", timeout=timeout, transport=transport,
            headers={"ZSESSIONID": api_key, "Accept": "application/json", "Content-Type": "application/json"})
        self._sem = asyncio.Semaphore(max_concurrency)
        self._analytics = base_url.rstrip("/").replace(WSAPI_PATH, LOOKBACK_PATH) if WSAPI_PATH in base_url else None

    @property
    def connected(self) -> bool:
        return bool(self._api_key)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get(self, path: str, params: dict[str, Any] | None = None) -> dict:
        return await self._send("GET", path, params=params)

    async def post(self, path: str, body: dict, params: dict[str, Any] | None = None) -> dict:
        return await self._send("POST", path, params=params, json=body)

    async def delete(self, path: str) -> dict:
        return await self._send("DELETE", path)

    async def page(self, path: str, params: dict[str, Any], *, start: int, pagesize: int) -> tuple[list[dict], int]:
        """One page of a collection: its rows and Rally's total count."""
        body = await self.get(path, {**params, "start": start, "pagesize": pagesize})
        qr = body["QueryResult"]
        return qr["Results"], qr["TotalResultCount"]

    async def query(self, path: str, params: dict[str, Any], *, limit: int = 200, pagesize: int = 200) -> list[dict]:
        """Up to `limit` rows of a collection. The first page says how many there are and how big Rally's pages really
        are (it caps `pagesize`, at 2000 on WSAPI); the rest are then fetched in parallel, within the concurrency cap."""
        rows, total = await self.page(path, params, start=1, pagesize=min(pagesize, limit))
        want = min(total, limit)
        if not rows or len(rows) >= want:
            return rows[:want]
        step = len(rows)
        starts = range(1 + step, want + 1, step)
        rest = await asyncio.gather(*(self.page(path, params, start=s, pagesize=min(step, want - s + 1)) for s in starts))
        results = rows + [row for chunk, _ in rest for row in chunk]
        return results[:want]

    async def lookback(self, workspace_id: int, body: dict) -> list[dict]:
        """Snapshots from the Lookback API (the analytics base next to WSAPI), up to 100000, in a stable order so that paging
        by offset neither repeats nor skips rows. Any failure, a timeout, a short read or a result too big to read answers
        502 "Burn-up unavailable" (planning ruling 15); the cause (never a header or the key) goes to the log."""
        if self._analytics is None:
            raise _unavailable("the Rally URL has no WSAPI path to derive the analytics base from")
        url = f"{self._analytics}/workspace/{int(workspace_id)}/artifact/snapshot/query.js"
        rows: list[dict] = []
        try:
            while True:
                reply = await self.post(url, {**body, "sort": LOOKBACK_SORT, "start": len(rows), "pagesize": LOOKBACK_PAGE})
                total, page = reply["TotalResultCount"], reply["Results"]
                if reply["Errors"]:
                    raise _unavailable("; ".join(map(str, reply["Errors"])))
                if total > LOOKBACK_MAX:
                    raise _unavailable(f"{total} snapshots is over the {LOOKBACK_MAX} limit")
                rows.extend(page)
                if len(rows) >= total:
                    return rows
                if not page:
                    raise _unavailable(f"read {len(rows)} of {total} snapshots")
        except RallyError as e:
            if e.message == BURNUP_UNAVAILABLE:
                raise
            raise _unavailable(e.message) from None
        except (KeyError, TypeError) as e:
            raise _unavailable(f"unexpected reply ({e.__class__.__name__})") from None

    async def _send(self, method: str, path: str, **kw: Any) -> dict:
        try:
            return await self._send_once(method, path, **kw)
        except RallyError as e:
            if method == "GET" or e.status != 422 or _CONFLICT not in e.message.lower():
                raise
        # Rally answers overlapping writes with a concurrency conflict; one retry is enough (spec D19).
        return await self._send_once(method, path, **kw)

    async def _send_once(self, method: str, path: str, **kw: Any) -> dict:
        if not self._api_key:
            raise RallyError(401, NOT_CONNECTED)
        async with self._sem:
            try:
                response = await self._http.request(method, path.lstrip("/"), **kw)
            except httpx.TimeoutException:
                raise RallyError(504, "Rally didn't respond in time") from None
            except httpx.TransportError as e:
                raise RallyError(502, f"Couldn't reach Rally ({e.__class__.__name__})") from None
        if response.status_code == 401:
            raise RallyError(401, "Rally rejected the API key")
        if response.status_code >= 400:
            raise RallyError(502, f"Rally returned HTTP {response.status_code}")
        try:
            body = response.json()
        except ValueError:
            raise RallyError(502, "Rally returned a non-JSON response") from None
        envelope = next(iter(body.values())) if isinstance(body, dict) and len(body) == 1 else None
        if isinstance(envelope, dict) and envelope.get("Errors"):
            raise RallyError(422, "; ".join(envelope["Errors"]))
        return body
