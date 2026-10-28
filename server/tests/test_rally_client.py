import json
import asyncio

import httpx
import pytest

from app.rally.client import NOT_CONNECTED, RallyClient, RallyError
from tests.fixtures import BASE


def make(handler, **kw) -> RallyClient:
    return RallyClient(BASE, kw.pop("api_key", "test-key"), transport=httpx.MockTransport(handler), **kw)


def page(rows, total):
    return {"QueryResult": {"Errors": [], "Warnings": [], "TotalResultCount": total, "StartIndex": 1, "Results": rows}}


async def test_sends_key_header_and_joins_base_url():
    seen = {}

    def handler(request: httpx.Request):
        seen["key"] = request.headers["ZSESSIONID"]
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"User": {"ObjectID": 1}})

    client = make(handler)
    body = await client.get("/user", {"fetch": "ObjectID"})
    await client.aclose()
    assert seen == {"key": "test-key", "url": f"{BASE}/user?fetch=ObjectID"}
    assert body == {"User": {"ObjectID": 1}}


async def test_missing_key_is_401_without_a_request():
    calls = []
    client = make(lambda r: calls.append(r) or httpx.Response(200, json={}), api_key="")
    assert client.connected is False
    with pytest.raises(RallyError) as e:
        await client.get("/user")
    assert e.value.status == 401 and e.value.message == NOT_CONNECTED and calls == []


async def test_errors_envelope_is_422_with_rally_message():
    client = make(lambda r: httpx.Response(200, json={"OperationResult": {"Errors": ["Validation error: X", "Y"], "Warnings": []}}))
    with pytest.raises(RallyError) as e:
        await client.post("/hierarchicalrequirement/1", {"HierarchicalRequirement": {}})
    assert e.value.status == 422 and e.value.message == "Validation error: X; Y"


async def test_http_401_is_reported_as_bad_key():
    client = make(lambda r: httpx.Response(401, text="Unauthorized"))
    with pytest.raises(RallyError) as e:
        await client.get("/user")
    assert e.value.status == 401 and e.value.message == "Rally rejected the API key"


async def test_timeout_is_504():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(RallyError) as e:
        await make(handler).get("/user")
    assert e.value.status == 504 and e.value.message == "Rally didn't respond in time"


async def test_connect_error_is_502():
    def handler(request):
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(RallyError) as e:
        await make(handler).get("/user")
    assert e.value.status == 502


async def test_non_json_is_502():
    with pytest.raises(RallyError) as e:
        await make(lambda r: httpx.Response(200, text="<html>")).get("/user")
    assert e.value.status == 502


async def test_query_pages_until_total():
    starts = []

    def handler(request):
        start = int(request.url.params["start"])
        starts.append(start)
        rows = [{"ObjectID": n} for n in range(start, min(start + 2, 4))]  # server pages by 2
        return httpx.Response(200, json=page(rows, 3))

    rows = await make(handler).query("/artifact", {"query": "(A = 1)"})
    assert [r["ObjectID"] for r in rows] == [1, 2, 3] and starts == [1, 3]


async def test_query_respects_limit():
    sizes = []

    def handler(request):
        size = int(request.url.params["pagesize"])
        sizes.append(size)
        start = int(request.url.params["start"])
        return httpx.Response(200, json=page([{"ObjectID": start + i} for i in range(size)], 500))

    rows = await make(handler).query("/artifact", {}, limit=250)
    assert len(rows) == 250 and sizes == [200, 50]


async def test_query_asks_for_the_larger_page_then_fetches_the_rest_in_parallel():
    live = peak = 0
    seen = []

    async def handler(request):
        nonlocal live, peak
        start, size = int(request.url.params["start"]), int(request.url.params["pagesize"])
        seen.append((start, size))
        live += 1
        peak = max(peak, live)
        await asyncio.sleep(0.01)
        live -= 1
        rows = [{"ObjectID": n} for n in range(start, min(start + size, 4500 + 1))]
        return httpx.Response(200, json=page(rows, 4500))

    rows = await make(handler).query("/artifact", {}, limit=5000, pagesize=2000)
    assert [r["ObjectID"] for r in rows] == list(range(1, 4501))
    assert seen[0] == (1, 2000) and sorted(seen[1:]) == [(2001, 2000), (4001, 500)]
    assert peak == 2


async def test_query_with_a_capped_server_keeps_every_row_in_order():
    def handler(request):
        start = int(request.url.params["start"])
        rows = [{"ObjectID": n} for n in range(start, min(start + 2, 8))]  # server pages by 2 whatever is asked
        return httpx.Response(200, json=page(rows, 7))

    rows = await make(handler).query("/artifact", {}, pagesize=2000)
    assert [r["ObjectID"] for r in rows] == [1, 2, 3, 4, 5, 6, 7]


async def test_concurrency_is_capped():
    live = peak = 0

    async def handler(request):
        nonlocal live, peak
        live += 1
        peak = max(peak, live)
        await asyncio.sleep(0.01)
        live -= 1
        return httpx.Response(200, json={"User": {}})

    client = make(handler, max_concurrency=2)
    await asyncio.gather(*(client.get("/user") for _ in range(10)))
    assert peak == 2


CONFLICT = ("Concurrency conflict: [Object has been modified since being read for update in this context] - "
            "ConcurrencyConflictException")


async def test_concurrency_conflict_is_retried_once():
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(200, json={"OperationResult": {"Errors": [CONFLICT], "Warnings": []}})
        return httpx.Response(200, json={"OperationResult": {"Errors": [], "Warnings": [], "Object": {"ObjectID": 1}}})

    body = await make(handler).post("/hierarchicalrequirement/1", {"HierarchicalRequirement": {}})
    assert body["OperationResult"]["Object"] == {"ObjectID": 1} and len(calls) == 2


async def test_second_conflict_is_reported():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"OperationResult": {"Errors": [CONFLICT], "Warnings": []}})

    with pytest.raises(RallyError) as e:
        await make(handler).post("/hierarchicalrequirement/1", {"HierarchicalRequirement": {}})
    assert e.value.status == 422 and "Concurrency conflict" in e.value.message and len(calls) == 2


async def test_other_errors_are_not_retried():
    calls = []
    client = make(lambda r: calls.append(r) or httpx.Response(200, json={"OperationResult": {"Errors": ["Nope"], "Warnings": []}}))
    with pytest.raises(RallyError):
        await client.post("/hierarchicalrequirement/1", {"HierarchicalRequirement": {}})
    assert len(calls) == 1


async def test_page_returns_rows_and_total():
    seen = {}

    def handler(request):
        seen.update(request.url.params)
        return httpx.Response(200, json=page([{"ObjectID": 101}], 340))

    rows, total = await make(handler).page("/artifact", {"query": "(A = 1)"}, start=101, pagesize=100)
    assert rows == [{"ObjectID": 101}] and total == 340
    assert seen["start"] == "101" and seen["pagesize"] == "100" and seen["query"] == "(A = 1)"


def lookback_page(rows, total, start=0):
    return {"Errors": [], "Warnings": [], "TotalResultCount": total, "StartIndex": start, "PageSize": 20000, "Results": rows}


async def test_lookback_posts_to_the_analytics_base_with_the_key_and_body():
    seen = {}

    def handler(request: httpx.Request):
        seen.update(key=request.headers["ZSESSIONID"], url=str(request.url), method=request.method, body=json.loads(request.content))
        return httpx.Response(200, json=lookback_page([{"ObjectID": 1}], 1))

    find = {"find": {"_TypeHierarchy": "HierarchicalRequirement"}, "fields": ["ObjectID"]}
    rows = await make(handler).lookback(8001, find)
    assert rows == [{"ObjectID": 1}]
    assert seen["method"] == "POST" and seen["key"] == "test-key"
    assert seen["url"] == "https://rally.example/analytics/v2.0/service/rally/workspace/8001/artifact/snapshot/query.js"
    assert seen["body"] == {**find, "sort": {"_ValidFrom": 1, "ObjectID": 1}, "start": 0, "pagesize": 20000}


async def test_lookback_pages_by_start_until_the_total_with_the_same_sort_every_page():
    starts, sorts = [], []

    def handler(request):
        sent = json.loads(request.content)
        start = sent["start"]
        starts.append(start)
        sorts.append(sent["sort"])
        return httpx.Response(200, json=lookback_page([{"n": n} for n in range(start, min(start + 20000, 45000))], 45000, start))

    rows = await make(handler).lookback(8001, {"find": {}})
    assert len(rows) == 45000 and starts == [0, 20000, 40000]
    assert sorts == [{"_ValidFrom": 1, "ObjectID": 1}] * 3


async def test_lookback_beyond_the_snapshot_cap_is_unavailable():
    with pytest.raises(RallyError) as e:
        await make(lambda r: httpx.Response(200, json=lookback_page([{"n": 1}], 100001))).lookback(8001, {"find": {}})
    assert e.value.status == 502 and e.value.message == "Burn-up unavailable"


async def test_lookback_timeout_is_unavailable():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(RallyError) as e:
        await make(handler).lookback(8001, {"find": {}})
    assert e.value.status == 502 and e.value.message == "Burn-up unavailable"


async def test_lookback_errors_and_http_failures_are_unavailable():
    errors = {"Errors": ["bad find"], "Warnings": [], "TotalResultCount": 0, "Results": []}
    for response in (httpx.Response(200, json=errors), httpx.Response(500, text="boom"), httpx.Response(200, text="<html>")):
        with pytest.raises(RallyError) as e:
            await make(lambda r, resp=response: resp).lookback(8001, {"find": {}})
        assert e.value.status == 502 and e.value.message == "Burn-up unavailable"


async def test_lookback_short_read_is_unavailable_not_partial():
    pages = iter([lookback_page([{"n": 1}] * 20000, 30000), lookback_page([], 30000, 20000)])
    with pytest.raises(RallyError) as e:
        await make(lambda r: httpx.Response(200, json=next(pages))).lookback(8001, {"find": {}})
    assert e.value.status == 502 and e.value.message == "Burn-up unavailable"


async def test_lookback_logs_the_cause_but_never_the_key(caplog):
    errors = {"Errors": ["bad find"], "Warnings": [], "TotalResultCount": 0, "Results": []}
    with caplog.at_level("WARNING", logger="mira"):
        with pytest.raises(RallyError) as e:
            await make(lambda r: httpx.Response(200, json=errors), api_key="sekrit-key-123").lookback(8001, {"find": {}})
        def timeout(request):
            raise httpx.ReadTimeout("slow", request=request)
        with pytest.raises(RallyError):
            await make(timeout, api_key="sekrit-key-123").lookback(8001, {"find": {}})
    assert "sekrit-key-123" not in e.value.message and "sekrit-key-123" not in caplog.text
    assert "bad find" in caplog.text and "Rally didn't respond in time" in caplog.text
