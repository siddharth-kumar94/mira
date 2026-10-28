"""Stands in for RallyClient in adapter tests. The first route matching (kind, path, query substring) answers."""


class FakeClient:
    def __init__(self, connected: bool = True):
        self.calls: list[tuple[str, str, dict, dict | None]] = []
        self.sizes: list[tuple[str, int, int]] = []  # (path, limit, pagesize) of every query()
        self._routes: list[tuple[str, str, str | None, object]] = []
        self.connected = connected
        self.closed = False

    def on(self, kind: str, path: str, response, query_has: str | None = None) -> "FakeClient":
        self._routes.append((kind, path, query_has, response))
        return self

    def _answer(self, kind, path, params, body):
        params = dict(params or {})
        self.calls.append((kind, path, params, body))
        for k, p, needle, response in self._routes:
            if k == kind and p == path and (needle is None or needle in params.get("query", "")):
                if isinstance(response, Exception):
                    raise response
                return response(params, body) if callable(response) else response
        raise AssertionError(f"unexpected {kind} {path} {params}")

    async def get(self, path, params=None):
        return self._answer("GET", path, params, None)

    async def post(self, path, body, params=None):
        return self._answer("POST", path, params, body)

    async def delete(self, path):
        return self._answer("DELETE", path, None, None)

    async def query(self, path, params, *, limit=200, pagesize=200):
        self.sizes.append((path, limit, pagesize))
        return self._answer("QUERY", path, params, None)

    async def page(self, path, params, *, start, pagesize):
        rows, total = self._answer("PAGE", path, {**params, "start": start, "pagesize": pagesize}, None)
        return rows, total

    async def lookback(self, workspace_id, body):
        return self._answer("LOOKBACK", f"/workspace/{workspace_id}", {}, body)

    async def aclose(self):
        self.closed = True

    def posts(self):
        return [c for c in self.calls if c[0] == "POST"]

    def queries(self, path):
        return [c for c in self.calls if c[0] == "QUERY" and c[1] == path]

    def lookbacks(self):
        return [c[3] for c in self.calls if c[0] == "LOOKBACK"]
