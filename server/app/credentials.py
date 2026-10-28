"""The Rally API key Mira was connected with (spec D14): one line in ~/.config/mira/credentials, mode 0600."""
import os
from pathlib import Path

DEFAULT_PATH = Path.home() / ".config" / "mira" / "credentials"


def read_key(path: Path) -> str | None:
    try:
        key = Path(path).read_text().strip()
    except FileNotFoundError:
        return None
    return key or None


def write_key(key: str, path: Path) -> None:
    path = Path(path)
    created = not path.parent.exists()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if created:  # never change the mode of a directory the user pointed us at
        os.chmod(path.parent, 0o700)
    tmp = path.with_name(path.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(key.strip() + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def delete_key(path: Path) -> None:
    Path(path).unlink(missing_ok=True)
