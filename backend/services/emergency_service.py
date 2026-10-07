import logging
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import jwt

from backend.config import Config
from backend.utils import db
from backend.services.firebase_service import FirebaseService
from backend.utils.validators import validate_coordinates

logger = logging.getLogger(__name__)


class EmergencyService:
    """Business logic for EchoHand emergency alerts and FCM token registration."""

    @staticmethod
    def generate_invite_token(user_id: str, contact_id: int) -> str:
        """
        Generates a secure, cryptographically signed token allowing an emergency
        contact to register their device without needing user credentials.
        """
        now = datetime.now(timezone.utc)
        expiration = now + timedelta(days=7)

        payload = {
            "sub": str(user_id),
            "contact_id": int(contact_id),
            "type": "contact_invite",
            "iat": int(now.timestamp()),
            "exp": int(expiration.timestamp())
        }

        return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")

    @staticmethod
    def verify_invite_token(invite_token: str):
        """
        Validates an emergency contact invite token.
        Returns (is_valid: bool, user_doc: dict or None, contact: dict or None, error: str or None)
        """
        if not invite_token:
            return False, None, None, "Invite token is required."

        try:
            payload = jwt.decode(invite_token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
            if payload.get("type") != "contact_invite":
                return False, None, None, "Invalid token type."

            user_id = payload.get("sub")
            contact_id = payload.get("contact_id")

            database = db.get_db()
            user_doc = database.users.find_one({"_id": ObjectId(user_id)})
            if not user_doc:
                return False, None, None, "User associated with this invite does not exist."

            contacts = user_doc.get("emergency_contacts", [])
            target_contact = None
            for c in contacts:
                if c.get("id") == contact_id:
                    target_contact = c
                    break

            if not target_contact:
                return False, None, None, "Emergency contact record not found for this user."

            return True, user_doc, target_contact, None

        except jwt.ExpiredSignatureError:
            return False, None, None, "This registration invite link has expired. Please request a new one."
        except jwt.InvalidTokenError:
            return False, None, None, "Invalid or corrupt registration link."
        except Exception as e:
            return False, None, None, f"Invite verification error: {str(e)}"

    @staticmethod
    def register_contact_token(user_id: str, fcm_token: str, contact_id: int = None) -> dict:
        """
        Registers an FCM token for an emergency contact of the specified user.
        Supports multiple tokens per contact and avoids duplicate token entries.
        """
        clean_token = str(fcm_token).strip()
        if not clean_token:
            return {
                "success": False,
                "status_code": 400,
                "message": "FCM device token cannot be empty."
            }

        try:
            database = db.get_db()
            user_doc = database.users.find_one({"_id": ObjectId(user_id)})
            if not user_doc:
                return {
                    "success": False,
                    "status_code": 404,
                    "message": "User not found."
                }

            contacts = user_doc.get("emergency_contacts", [])
            if not contacts:
                return {
                    "success": False,
                    "status_code": 404,
                    "message": "No emergency contacts configured for this user."
                }

            # Find matching contact or default to primary contact
            target_index = -1
            if contact_id is not None:
                for idx, c in enumerate(contacts):
                    if c.get("id") == contact_id:
                        target_index = idx
                        break

            if target_index == -1:
                # Default to primary or first contact
                for idx, c in enumerate(contacts):
                    if c.get("is_primary"):
                        target_index = idx
                        break
                if target_index == -1:
                    target_index = 0

            target_contact = contacts[target_index]
            tokens = target_contact.get("fcm_tokens", [])
            if not isinstance(tokens, list):
                tokens = []

            # Append token if not already stored
            token_added = False
            if clean_token not in tokens:
                tokens.append(clean_token)
                target_contact["fcm_tokens"] = tokens
                contacts[target_index] = target_contact
                token_added = True

                now = datetime.now(timezone.utc)
                database.users.update_one(
                    {"_id": user_doc["_id"]},
                    {
                        "$set": {
                            "emergency_contacts": contacts,
                            "updated_at": now
                        }
                    }
                )
            else:
                logger.info(
                    "FCM token already registered for contact %s (user %s); skipping duplicate.",
                    target_contact.get("name", "contact"),
                    user_id,
                )

            return {
                "success": True,
                "status_code": 200,
                "message": (
                    f"Device registered successfully for {target_contact.get('name', 'contact')}."
                    if token_added
                    else f"Notifications already active for {target_contact.get('name', 'contact')} on this device."
                ),
                "contact": {
                    "id": target_contact.get("id"),
                    "name": target_contact.get("name"),
                    "token_count": len(target_contact.get("fcm_tokens", []))
                }
            }

        except Exception as e:
            logger.error(f"Error registering FCM token: {str(e)}")
            return {
                "success": False,
                "status_code": 500,
                "message": "Internal error registering notification token."
            }

    @staticmethod
    def remove_fcm_tokens(user_id: str, tokens_to_remove: list) -> bool:
        """
        Removes invalid or expired FCM tokens from a user's emergency contacts in MongoDB.
        """
        if not tokens_to_remove:
            return True

        try:
            database = db.get_db()
            user_doc = database.users.find_one({"_id": ObjectId(user_id)})
            if not user_doc:
                return False

            contacts = user_doc.get("emergency_contacts", [])
            tokens_set = set(tokens_to_remove)
            modified = False

            for c in contacts:
                existing_tokens = c.get("fcm_tokens", [])
                if isinstance(existing_tokens, list):
                    filtered = [t for t in existing_tokens if t not in tokens_set]
                    if len(filtered) != len(existing_tokens):
                        c["fcm_tokens"] = filtered
                        modified = True

            if modified:
                now = datetime.now(timezone.utc)
                database.users.update_one(
                    {"_id": user_doc["_id"]},
                    {
                        "$set": {
                            "emergency_contacts": contacts,
                            "updated_at": now
                        }
                    }
                )
                logger.info(f"Removed {len(tokens_to_remove)} invalid FCM token(s) for user {user_id}")

            return True

        except Exception as e:
            logger.error(f"Error pruning invalid FCM tokens: {str(e)}")
            return False

    @staticmethod
    def send_emergency_alert(user_id: str, source: str = "manual", lat=None, lng=None) -> dict:
        """
        Dispatches emergency FCM notification to all registered contact devices
        for the authenticated user.
        """
        # Validate coordinates
        is_coord_valid, clean_lat, clean_lng, coord_err = validate_coordinates(lat, lng)
        if not is_coord_valid:
            return {
                "success": False,
                "status_code": 400,
                "message": coord_err
            }

        clean_source = "gesture" if str(source).lower() == "gesture" else "manual"

        try:
            database = db.get_db()
            user_doc = database.users.find_one({"_id": ObjectId(user_id)})
            if not user_doc:
                logger.warning("Emergency alert: user not found (id=%s)", user_id)
                return {
                    "success": False,
                    "status_code": 404,
                    "message": "User not found."
                }

            user_name = user_doc.get("name", "EchoHand User")
            contacts = user_doc.get("emergency_contacts", [])

            logger.info(
                "Emergency alert requested by user_id=%s source=%s coords=(%s,%s) contacts=%d",
                user_id,
                clean_source,
                clean_lat,
                clean_lng,
                len(contacts),
            )

            if not contacts:
                return {
                    "success": False,
                    "status_code": 404,
                    "message": "No emergency contacts configured for your account. Please add contacts in your profile."
                }

            # Collect all registered FCM tokens
            all_tokens = []
            contacts_with_tokens = []

            for c in contacts:
                c_tokens = c.get("fcm_tokens", [])
                if isinstance(c_tokens, list) and c_tokens:
                    all_tokens.extend([str(t).strip() for t in c_tokens if str(t).strip()])
                    contacts_with_tokens.append(c.get("name", "Contact"))

            # Remove duplicate tokens
            all_tokens = list(dict.fromkeys(all_tokens))

            logger.info(
                "Emergency alert token summary user_id=%s contacts_with_tokens=%d unique_tokens=%d",
                user_id,
                len(contacts_with_tokens),
                len(all_tokens),
            )

            if not all_tokens:
                return {
                    "success": False,
                    "status_code": 422,
                    "message": (
                        "Emergency contact has not registered a notification device. "
                        "Ask them to open Emergency Help and tap Enable on This Device."
                    ),
                    "contacts_configured": len(contacts),
                    "contacts_with_tokens": 0
                }

            # Build alert content (USER location — not the contact's device location)
            title = "🚨 EchoHand Emergency Alert"
            body = "Emergency assistance is required."

            if clean_lat is not None and clean_lng is not None:
                maps_url = f"https://www.google.com/maps?q={clean_lat},{clean_lng}"
                body += f"\n\nLocation:\n{maps_url}"
            else:
                maps_url = ""
                body += "\n\nLocation: Unavailable"

            data_payload = {
                "type": "emergency",
                "source": clean_source,
                "latitude": str(clean_lat) if clean_lat is not None else "",
                "longitude": str(clean_lng) if clean_lng is not None else "",
                "maps_url": maps_url,
                "user_name": user_name,
                "title": title,
                "body": body
            }

            # Dispatch via Firebase Admin SDK
            fcm_result = FirebaseService.send_emergency_multicast(
                tokens=all_tokens,
                title=title,
                body=body,
                data_payload=data_payload,
                click_url=maps_url or None
            )

            logger.info(
                "Emergency FCM result user_id=%s success=%s success_count=%s failure_count=%s invalid=%d",
                user_id,
                fcm_result.get("success"),
                fcm_result.get("success_count"),
                fcm_result.get("failure_count"),
                len(fcm_result.get("invalid_tokens") or []),
            )

            # Prune invalid tokens if detected
            invalid_tokens = fcm_result.get("invalid_tokens", [])
            if invalid_tokens:
                logger.info(
                    "Pruning %d invalid FCM token(s) for user_id=%s",
                    len(invalid_tokens),
                    user_id,
                )
                EmergencyService.remove_fcm_tokens(user_id, invalid_tokens)

            if fcm_result.get("success"):
                return {
                    "success": True,
                    "status_code": 200,
                    "message": f"Emergency alert sent successfully to {len(contacts_with_tokens)} emergency contact(s).",
                    "contacts_notified": len(contacts_with_tokens),
                    "tokens_sent": fcm_result.get("success_count", 0),
                    "maps_url": maps_url,
                    "source": clean_source
                }

            error_text = fcm_result.get("error") or "Unknown FCM error"
            err_lower = str(error_text).lower()
            if "not initialized" in err_lower or "not configured" in err_lower:
                return {
                    "success": False,
                    "status_code": 503,
                    "message": (
                        "Firebase Admin SDK is not configured on the server. "
                        "Set FIREBASE_CREDENTIALS_PATH (or GOOGLE_APPLICATION_CREDENTIALS) and "
                        "FIREBASE_PROJECT_ID, then restart the backend."
                    ),
                }

            return {
                "success": False,
                "status_code": 502,
                "message": f"Unable to deliver alert via Firebase: {error_text}",
                "tokens_attempted": len(all_tokens),
                "failure_count": fcm_result.get("failure_count"),
            }

        except Exception as e:
            logger.exception("Error executing emergency alert for user_id=%s", user_id)
            return {
                "success": False,
                "status_code": 500,
                "message": f"Server error processing emergency alert: {str(e)}"
            }
