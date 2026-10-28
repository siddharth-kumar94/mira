"""Proxy settings, read from the repo-root .env (never committed)."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from .credentials import DEFAULT_PATH

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    rally_api_key: str = ""
    rally_base_url: str = "https://rally1.rallydev.com/slm/webservice/v2.0"
    rally_workspace: int = 0
    rally_project: int = 0
    rally_timeout_s: float = 15.0
    rally_max_concurrency: int = 4
    mira_credentials: Path = DEFAULT_PATH
