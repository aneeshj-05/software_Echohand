import os
import logging
import firebase_admin
from firebase_admin import credentials, messaging
from backend.config import Config

logger = logging.getLogger(__name__)

_firebase_initialized = False


def init_firebase(app=None) -> bool:
    """
    Initializes the Firebase Admin SDK once at backend startup.
    Uses either the service account certificate specified in FIREBASE_CREDENTIALS_PATH /
    GOOGLE_APPLICATION_CREDENTIALS, or Application Default Credentials (ADC).
    Never exposes or logs credential contents.
    """
    global _firebase_initialized

    if firebase_admin._apps:
        _firebase_initialized = True
        return True

    cred_path = Config.FIREBASE_CREDENTIALS_PATH or os.getenv('GOOGLE_APPLICATION_CREDENTIALS', '')

    try:
        if cred_path and os.path.isfile(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully using certificate file.")
        else:
            firebase_admin.initialize_app()
            logger.info("Firebase Admin SDK initialized using default environment credentials.")

        _firebase_initialized = True
        return True
    except Exception as err:
        logger.warning(
            f"Firebase Admin SDK initialization deferred or failed: {str(err)}. "
            "Ensure GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_CREDENTIALS_PATH is configured."
        )
        return False


def is_firebase_initialized() -> bool:
    """Checks whether Firebase Admin SDK is initialized."""
    return bool(firebase_admin._apps)


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
            # Try initializing one more time if not done yet
            if not init_firebase():
                return {
                    "success": False,
                    "error": "Firebase Admin SDK is not initialized.",
                    "success_count": 0,
                    "failure_count": len(tokens) if tokens else 0,
                    "invalid_tokens": []
                }

        clean_tokens = [str(t).strip() for t in tokens if str(t).strip()]
        # Remove duplicates while preserving order
        clean_tokens = list(dict.fromkeys(clean_tokens))

        if not clean_tokens:
            return {
                "success": False,
                "error": "No valid FCM device tokens provided.",
                "success_count": 0,
                "failure_count": 0,
                "invalid_tokens": []
            }

        # Data payload values must all be strings
        sanitized_data = {}
        if data_payload:
            for k, v in data_payload.items():
                sanitized_data[str(k)] = "" if v is None else str(v)

        target_url = click_url or sanitized_data.get("maps_url") or "/dashboard.html"

        # Webpush configuration ensuring persistent, interactive emergency alert
        webpush_config = messaging.WebpushConfig(
            headers={
                "Urgency": "high"
            },
            notification=messaging.WebpushNotification(
                title=title,
                body=body,
                icon="/favicon.ico",
                require_interaction=True
            ),
            fcm_options=messaging.WebpushFCMOptions(
                link=target_url
            )
        )

        message = messaging.MulticastMessage(
            tokens=clean_tokens,
            notification=messaging.Notification(
                title=title,
                body=body
            ),
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

                    # Detect expired / unregistered tokens
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
            logger.error(f"FCM multicast dispatch error: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to deliver FCM notification: {str(e)}",
                "success_count": 0,
                "failure_count": len(clean_tokens),
                "invalid_tokens": []
            }
