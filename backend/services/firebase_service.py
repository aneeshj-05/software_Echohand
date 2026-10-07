import os
import logging
import firebase_admin
from firebase_admin import credentials, messaging
from backend.config import Config
from backend.utils.firebase_admin_config import (
    validate_firebase_admin_configuration,
    resolve_service_account_path,
    resolve_admin_project_id,
)

logger = logging.getLogger(__name__)

_firebase_initialized = False
_resolved_admin_project_id: str | None = None


def get_resolved_admin_project_id() -> str | None:
    """Project ID used for the initialized Firebase Admin app (if any)."""
    return _resolved_admin_project_id


def _project_id_from_existing_app() -> str | None:
    if not firebase_admin._apps:
        return None
    try:
        default_app = firebase_admin.get_app()
    except ValueError:
        return None

    project_id = getattr(default_app, "project_id", None)
    if project_id:
        return str(project_id)

    options = getattr(default_app, "options", None) or {}
    if isinstance(options, dict):
        return options.get("projectId") or options.get("project_id")
    return None


def _delete_default_firebase_app() -> None:
    if not firebase_admin._apps:
        return
    try:
        firebase_admin.delete_app(firebase_admin.get_app())
    except Exception as err:
        logger.warning("Could not remove existing Firebase Admin app: %s", err)


def init_firebase(app=None) -> bool:
    """
    Initializes Firebase Admin SDK with service account credentials and explicit project ID.
    Bare Application Default Credentials without project ID are not used (FCM requires project).
    """
    global _firebase_initialized, _resolved_admin_project_id

    existing_project = _project_id_from_existing_app()
    if existing_project:
        _resolved_admin_project_id = existing_project
        _firebase_initialized = True
        os.environ.setdefault("GOOGLE_CLOUD_PROJECT", existing_project)
        logger.info(
            "Firebase Admin SDK already initialized for project '%s'.",
            existing_project,
        )
        return True

    if firebase_admin._apps:
        logger.warning(
            "Firebase Admin default app exists without project ID; re-initializing for FCM."
        )
        _delete_default_firebase_app()
        _firebase_initialized = False
        _resolved_admin_project_id = None

    is_ready, project_id, config_errors = validate_firebase_admin_configuration()
    if not is_ready or not project_id:
        for message in config_errors:
            logger.error("Firebase Admin configuration error: %s", message)
        return False

    cred_path = resolve_service_account_path()
    try:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {"projectId": project_id})
        os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project_id)
        _resolved_admin_project_id = project_id
        _firebase_initialized = True
        logger.info(
            "Firebase Admin SDK initialized for project '%s' using service account credentials.",
            project_id,
        )
        return True
    except Exception as err:
        logger.error("Firebase Admin SDK initialization failed: %s", err)
        return False


def is_firebase_initialized() -> bool:
    """True when Admin SDK is initialized with a resolvable Firebase project ID."""
    if not firebase_admin._apps:
        return False
    project_id = _resolved_admin_project_id or _project_id_from_existing_app()
    return bool(project_id)


class FirebaseService:
    """Service wrapping Firebase Cloud Messaging (FCM) operations."""

    @staticmethod
    def send_emergency_multicast(
        tokens: list,
        title: str,
        body: str,
        data_payload: dict = None,
        click_url: str = None
    ) -> dict:
        """
        Sends an FCM multicast notification to a list of device tokens.
        Handles invalid/expired tokens and returns detailed delivery results.
        """
        if not is_firebase_initialized():
            if not init_firebase():
                return {
                    "success": False,
                    "error": (
                        "Firebase Admin SDK is not configured for FCM. Set FIREBASE_CREDENTIALS_PATH "
                        "(or GOOGLE_APPLICATION_CREDENTIALS) to your service account JSON and "
                        "FIREBASE_PROJECT_ID for the same Firebase project, then restart the server."
                    ),
                    "success_count": 0,
                    "failure_count": len(tokens) if tokens else 0,
                    "invalid_tokens": []
                }

        project_id = get_resolved_admin_project_id() or resolve_admin_project_id()
        if project_id:
            os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project_id)
        if not project_id:
            return {
                "success": False,
                "error": "Firebase Admin project ID is not configured.",
                "success_count": 0,
                "failure_count": len(tokens) if tokens else 0,
                "invalid_tokens": []
            }

        clean_tokens = [str(t).strip() for t in tokens if str(t).strip()]
        clean_tokens = list(dict.fromkeys(clean_tokens))

        if not clean_tokens:
            return {
                "success": False,
                "error": "No valid FCM device tokens provided.",
                "success_count": 0,
                "failure_count": 0,
                "invalid_tokens": []
            }

        sanitized_data = {}
        if data_payload:
            for k, v in data_payload.items():
                sanitized_data[str(k)] = "" if v is None else str(v)

        target_url = click_url or sanitized_data.get("maps_url") or "/dashboard.html"

        webpush_config = messaging.WebpushConfig(
            headers={"Urgency": "high"},
            notification=messaging.WebpushNotification(
                title=title,
                body=body,
                icon="/favicon.ico",
                require_interaction=True
            ),
            fcm_options=messaging.WebpushFCMOptions(link=target_url)
        )

        message = messaging.MulticastMessage(
            tokens=clean_tokens,
            notification=messaging.Notification(title=title, body=body),
            data=sanitized_data,
            webpush=webpush_config
        )

        try:
            batch_response = messaging.send_each_for_multicast(message)

            invalid_tokens = []
            delivery_errors = []

            for idx, resp in enumerate(batch_response.responses):
                token = clean_tokens[idx]
                if not resp.success:
                    exc = resp.exception
                    error_msg = str(exc) if exc else "Unknown error"
                    delivery_errors.append({"token_prefix": token[:10] + "...", "error": error_msg})

                    err_lower = error_msg.lower()
                    if any(key in err_lower for key in [
                        "unregistered",
                        "registration-token-not-registered",
                        "invalid-argument",
                        "senderidmismatch",
                        "not-registered"
                    ]):
                        invalid_tokens.append(token)

            return {
                "success": batch_response.success_count > 0,
                "total_tokens": len(clean_tokens),
                "success_count": batch_response.success_count,
                "failure_count": batch_response.failure_count,
                "invalid_tokens": invalid_tokens,
                "errors": delivery_errors
            }

        except Exception as e:
            logger.error("FCM multicast dispatch error (project=%s): %s", project_id, e)
            return {
                "success": False,
                "error": f"Failed to deliver FCM notification: {str(e)}",
                "success_count": 0,
                "failure_count": len(clean_tokens),
                "invalid_tokens": []
            }
