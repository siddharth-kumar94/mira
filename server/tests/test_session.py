import stat

import pytest

from app.credentials import read_key, write_key
from app.rally.client import RallyError
from tests.adapter_kit import make_adapter, standard
from tests.fake_client import FakeClient

KEY = "_abcdefSECRETKEY123"


def factory():
    made = []

    def make(key: str) -> FakeClient:
        c = FakeClient(connected=bool(key))
        if key == KEY:
            standard(c)
        else:
            c.on("GET", "/user", RallyError(401, "Rally rejected the API key"))
        made.append(c)
        return c
    return make, made


def test_write_key_is_private(tmp_path):
    path = tmp_path / "mira" / "credentials"
    write_key(KEY + "\n", path)
    assert read_key(path) == KEY
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700
    assert read_key(tmp_path / "missing") is None


def test_write_key_leaves_an_existing_directory_alone(tmp_path):
    shared = tmp_path / "shared"
    shared.mkdir()
    shared.chmod(0o755)
    write_key(KEY, shared / "credentials")
    assert stat.S_IMODE(shared.stat().st_mode) == 0o755
    assert stat.S_IMODE((shared / "credentials").stat().st_mode) == 0o600


async def test_session_without_a_key_makes_no_rally_call():
    c = FakeClient(connected=False)
    s = await make_adapter(c).session()
    assert (s.connected, s.me, s.write_guard) == (False, None, "demo") and c.calls == []


async def test_connect_validates_saves_and_swaps(tmp_path):
    make, made = factory()
    old = FakeClient(connected=False)
    a = make_adapter(old, factory=make, tmp_credentials=tmp_path / "credentials")
    s = await a.connect(KEY)
    assert s.connected and s.me.name == "Dana Demo" and s.workspace.name == "Demo Workspace"
    assert read_key(tmp_path / "credentials") == KEY and old.closed and a.client is made[0]
    assert KEY not in s.model_dump_json()


async def test_a_rejected_key_changes_nothing(tmp_path):
    make, made = factory()
    old = standard(FakeClient())
    a = make_adapter(old, factory=make, tmp_credentials=tmp_path / "credentials")
    with pytest.raises(RallyError) as e:
        await a.connect("wrong")
    assert e.value.status == 401 and e.value.message == "Rally rejected that key"
    assert a.client is old and made[0].closed and not (tmp_path / "credentials").exists()


async def test_disconnect_forgets_the_key(tmp_path):
    make, _ = factory()
    a = make_adapter(standard(FakeClient()), factory=make, tmp_credentials=tmp_path / "credentials")
    await a.connect(KEY)
    s = await a.disconnect()
    assert not s.connected and not (tmp_path / "credentials").exists()
