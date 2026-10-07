"""
Firebase Admin SDK configuration resolution (service account path + project ID).
Never loads or logs private key material.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from backend.utils.firebase_client_config import read_firebase_admin_project_id, _strip_env


def _config():
    from backend.config import Config
    return Config

_DRIVE_USERS_BROKEN = re.compile(r"^([A-Za-z]):Users(\\|/|$)")


def _repair_windows_path_after_dotenv(path: str) -> str:
    """
    Repair paths corrupted by .env / Python escape sequences on Windows.
    Examples:
      C:Users\\aishw\\...  (\\U in \\Users consumed as unicode escape)
      C:\\Users\\<bell>ishw (\\a in \\aishw became ASCII bell)
    """
    if not path:
        return path

    repaired = path.replace("\x07", "a")

    match = _DRIVE_USERS_BROKEN.match(repaired)
    if match:
        drive = match.group(1)
        rest = repaired[len(match.group(0)) :]
        if rest.startswith("\\") or rest.startswith("/"):
            rest = rest[1:]
        repaired = f"{drive}:\\Users\\{rest}"

    return repaired


def normalize_credentials_path(raw_path: str | None) -> Path | None:
    """
    Resolve FIREBASE_CREDENTIALS_PATH to an absolute Path if the file exists.
    Accepts C:\\Users\\... and C:/Users/... forms.
    """
    cleaned = _strip_env(raw_path)
    if not cleaned:
        return None

    cleaned = os.path.expandvars(cleaned)
    cleaned = _repair_windows_path_after_dotenv(cleaned)

    path = Path(cleaned).expanduser()
    try:
        resolved = path.resolve()
    except OSError:
        resolved = path.absolute()

    if resolved.is_file():
        return resolved

    if os.name == "nt":
        alt = Path(cleaned.replace("/", "\\")).expanduser()
        try:
            alt_resolved = alt.resolve()
        except OSError:
            alt_resolved = alt.absolute()
        if alt_resolved.is_file():
            return alt_resolved

    return resolved


def credentials_file_exists(raw_path: str | None) -> bool:
    normalized = normalize_credentials_path(raw_path)
    return normalized is not None and normalized.is_file()


def resolve_service_account_path() -> str:
    """Absolute path string to Firebase Admin service account JSON, or empty if unset."""
    Config = _config()
    raw = _strip_env(Config.FIREBASE_CREDENTIALS_PATH) or _strip_env(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    normalized = normalize_credentials_path(raw)
    return str(normalized) if normalized and normalized.is_file() else ""


def resolve_admin_project_id(credentials_path: str | None = None) -> str | None:
    """
    Project ID for Firebase Admin / FCM.
    Prefer service account JSON project_id; fall back to FIREBASE_PROJECT_ID.
    """
    cred_path = ""
    if credentials_path:
        normalized = normalize_credentials_path(credentials_path)
        cred_path = str(normalized) if normalized else _strip_env(credentials_path)
    else:
        cred_path = resolve_service_account_path()

    from_sa = read_firebase_admin_project_id(cred_path) if cred_path else None
    from_env = _strip_env(_config().FIREBASE_PROJECT_ID)
    return from_sa or from_env or None


def validate_firebase_admin_configuration() -> tuple[bool, str | None, list[str]]:
    """
    Returns (is_ready, resolved_project_id, error_messages).
    """
    errors: list[str] = []
    Config = _config()
    raw_cred = _strip_env(Config.FIREBASE_CREDENTIALS_PATH) or _strip_env(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    normalized = normalize_credentials_path(raw_cred)

    if not raw_cred:
        errors.append(
            "Set FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS to your "
            "Firebase service account JSON file (required for emergency FCM send)."
        )
    elif normalized is None or not normalized.is_file():
        errors.append(
            "Firebase service account file was not found at the configured credentials path "
            "(check FIREBASE_CREDENTIALS_PATH; on Windows prefer forward slashes, e.g. "
            "C:/Users/you/Downloads/your-file.json)."
        )

    cred_path = str(normalized) if normalized else ""
    sa_project = read_firebase_admin_project_id(cred_path) if cred_path else None
    env_project = _strip_env(Config.FIREBASE_PROJECT_ID)

    if sa_project and env_project and sa_project != env_project:
        errors.append(
            "FIREBASE_PROJECT_ID does not match the project_id in the service account JSON. "
            "Use the same Firebase project for Admin SDK and Web client config."
        )

    project_id = sa_project or env_project
    if not project_id:
        errors.append(
            "Firebase project ID is required. Set FIREBASE_PROJECT_ID in backend/.env or use a "
            "service account JSON that includes project_id."
        )

    if errors:
        return False, project_id, errors
    return True, project_id, []
