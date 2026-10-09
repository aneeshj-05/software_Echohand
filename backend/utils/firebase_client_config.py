"""
Public Firebase Web client configuration assembly and validation.
Used by /api/notifications/config and tests. Never loads or exposes private keys.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

# Substrings / values copied from docs or samples — not real credentials
PLACEHOLDER_MARKERS = (
    "dummy",
    "placeholder",
    "your-",
    "aizasydummy",
    "123456789012",
    "abcdef1234567890",
    "beldummy",
    "your-project-id",
    "your-messaging-sender-id",
    "your-vapid-key",
)

DOCUMENTATION_EXAMPLE_PROJECT_IDS = frozenset(
    {"echohand-emergency", "your-project-id", "your-firebase-project-id"}
)

REQUIRED_CLIENT_KEYS = (
    "apiKey",
    "projectId",
    "messagingSenderId",
    "appId",
    "vapidKey",
)


def _strip_env(value: str | None) -> str:
    if not value:
        return ""
    cleaned = str(value).strip().strip('"').strip("'")
    return cleaned


def read_firebase_admin_project_id(credentials_path: str | None = None) -> str | None:
    """
    Reads only project_id from the Firebase Admin service account JSON file.
    Does not load or return private key material.
    """
    from backend.utils.firebase_admin_config import normalize_credentials_path

    cred_path = _strip_env(credentials_path)
    if not cred_path:
        cred_path = _strip_env(os.getenv("FIREBASE_CREDENTIALS_PATH"))
    if not cred_path:
        cred_path = _strip_env(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    if not cred_path:
        return None

    normalized = normalize_credentials_path(cred_path)
    path = normalized if normalized else Path(cred_path)
    if not path.is_file():
        return None

    try:
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
        project_id = _strip_env(data.get("project_id"))
        return project_id or None
    except (OSError, json.JSONDecodeError, TypeError):
        return None


def _field_is_placeholder(key: str, value: str) -> bool:
    val = _strip_env(value)
    if not val:
        return True

    val_lower = val.lower()
    if "..." in val or val_lower.endswith("..."):
        return True

    if key in ("messagingSenderId", "projectId", "vapidKey", "apiKey", "appId"):
        if val_lower in PLACEHOLDER_MARKERS or val in PLACEHOLDER_MARKERS:
            return True
        if key == "projectId" and val_lower in DOCUMENTATION_EXAMPLE_PROJECT_IDS:
            return True
    elif any(marker in val_lower for marker in PLACEHOLDER_MARKERS):
        return True

    if key == "apiKey":
        if not val.startswith("AIzaSy") or len(val) < 30:
            return True
    elif key == "appId":
        if not re.match(r"^1:\d+:web:[0-9a-fA-F]+$", val):
            return True
    elif key == "messagingSenderId":
        if not re.match(r"^\d+$", val):
            return True
    elif key == "vapidKey":
        if len(val) < 80:
            return True

    return False


def app_id_matches_sender_id(app_id: str, messaging_sender_id: str) -> bool:
    app_id = _strip_env(app_id)
    sender = _strip_env(messaging_sender_id)
    if not app_id or not sender:
        return False
    parts = app_id.split(":")
    return len(parts) >= 4 and parts[0] == "1" and parts[1] == sender and parts[2] == "web"


def build_firebase_client_config(config_cls: Any) -> dict[str, str]:
    """Build the public Web SDK config dict from application Config."""
    project_id = _strip_env(getattr(config_cls, "FIREBASE_PROJECT_ID", ""))
    auth_domain = _strip_env(getattr(config_cls, "FIREBASE_AUTH_DOMAIN", ""))
    storage_bucket = _strip_env(getattr(config_cls, "FIREBASE_STORAGE_BUCKET", ""))

    if project_id and not auth_domain:
        auth_domain = f"{project_id}.firebaseapp.com"
    if project_id and not storage_bucket:
        storage_bucket = f"{project_id}.appspot.com"

    return {
        "apiKey": _strip_env(getattr(config_cls, "FIREBASE_API_KEY", "")),
        "authDomain": auth_domain,
        "projectId": project_id,
        "storageBucket": storage_bucket,
        "messagingSenderId": _strip_env(getattr(config_cls, "FIREBASE_MESSAGING_SENDER_ID", "")),
        "appId": _strip_env(getattr(config_cls, "FIREBASE_APP_ID", "")),
        "vapidKey": _strip_env(getattr(config_cls, "FIREBASE_VAPID_KEY", "")),
    }


def validate_firebase_client_config(
    config_dict: dict[str, Any],
    admin_project_id: str | None = None,
) -> tuple[bool, list[str], list[str]]:
    """
    Returns (is_configured, missing_or_invalid_fields, config_issues).
    config_issues holds human-readable hints (no secret values).
    """
    missing_fields: list[str] = []
    issues: list[str] = []

    for key in REQUIRED_CLIENT_KEYS:
        val = _strip_env(str(config_dict.get(key, "") or ""))
        if _field_is_placeholder(key, val):
            missing_fields.append(key)

    if missing_fields:
        issues.append(
            "Set all Firebase Web App fields in backend/.env from the same Firebase Console "
            "Web app (Project settings → General → Your apps)."
        )

    api_key = _strip_env(str(config_dict.get("apiKey", "") or ""))
    app_id = _strip_env(str(config_dict.get("appId", "") or ""))
    sender = _strip_env(str(config_dict.get("messagingSenderId", "") or ""))
    project_id = _strip_env(str(config_dict.get("projectId", "") or ""))

    if app_id and sender and not _field_is_placeholder("appId", app_id):
        if not app_id_matches_sender_id(app_id, sender):
            missing_fields.append("appId")
            missing_fields.append("messagingSenderId")
            issues.append(
                "FIREBASE_APP_ID and FIREBASE_MESSAGING_SENDER_ID must come from the same "
                "Firebase Web app configuration object."
            )

    if admin_project_id and project_id and not _field_is_placeholder("projectId", project_id):
        if admin_project_id != project_id:
            issues.append(
                "FIREBASE_PROJECT_ID does not match the Firebase Admin service account "
                f"project ({admin_project_id}). All client Web config must use that project."
            )
            if "projectId" not in missing_fields:
                missing_fields.append("projectId")

    is_configured = len(missing_fields) == 0 and not any(
        "does not match" in msg for msg in issues
    )
    # Deduplicate while preserving order
    seen = set()
    deduped_missing = []
    for field in missing_fields:
        if field not in seen:
            seen.add(field)
            deduped_missing.append(field)

    return is_configured, deduped_missing, issues
