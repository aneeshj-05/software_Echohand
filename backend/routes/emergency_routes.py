import logging
from flask import Blueprint, request, jsonify
from backend.services.emergency_service import EmergencyService
from backend.utils.security import token_required, decode_token
from backend.config import Config

logger = logging.getLogger(__name__)

emergency_bp = Blueprint('emergency', __name__, url_prefix='/api/emergency')
notification_bp = Blueprint('notifications', __name__, url_prefix='/api/notifications')


# Known placeholder indicators in Firebase client configuration
PLACEHOLDER_MARKERS = [
    'dummy', 'placeholder', 'your-', 'aizasydummy',
    '123456789012', 'abcdef1234567890', 'beldummy'
]


def validate_firebase_client_config(config_dict: dict):
    """
    Validates that client-side Firebase Web configuration fields are present and non-placeholder.
    Returns (is_configured: bool, missing_fields: list[str])
    """
    required_keys = ['apiKey', 'projectId', 'messagingSenderId', 'appId', 'vapidKey']
    missing_fields = []

    for key in required_keys:
        val = str(config_dict.get(key, '') or '').strip()
        if not val:
            missing_fields.append(key)
            continue

        val_lower = val.lower()
        # Check against placeholder strings
        if any(marker in val_lower for marker in PLACEHOLDER_MARKERS):
            missing_fields.append(key)
        elif key == 'apiKey' and not val.startswith('AIzaSy'):
            missing_fields.append(key)
        elif key == 'projectId' and val_lower == 'echohand-emergency' and not config_dict.get('apiKey'):
            missing_fields.append(key)

    is_configured = (len(missing_fields) == 0)
    return is_configured, missing_fields


# ── Notification Endpoints ──────────────────────────────────────────

@notification_bp.route('/config', methods=['GET'])
def get_notification_config():
    """
    Returns public client-side Firebase Web configuration and VAPID public key.
    Includes configuration status and validation details.
    Never exposes backend private keys.
    """
    cfg = {
        "apiKey": Config.FIREBASE_API_KEY,
        "authDomain": Config.FIREBASE_AUTH_DOMAIN,
        "projectId": Config.FIREBASE_PROJECT_ID,
        "storageBucket": Config.FIREBASE_STORAGE_BUCKET,
        "messagingSenderId": Config.FIREBASE_MESSAGING_SENDER_ID,
        "appId": Config.FIREBASE_APP_ID,
        "vapidKey": Config.FIREBASE_VAPID_KEY
    }

    is_configured, missing_fields = validate_firebase_client_config(cfg)

    return jsonify({
        "success": True,
        "is_configured": is_configured,
        "missing_fields": missing_fields,
        "config": cfg
    }), 200



@notification_bp.route('/register', methods=['POST'])
def register_device_token():
    """
    Registers an FCM device token for an emergency contact.
    Supported authorization methods:
      1. Authenticated user (Bearer token in Authorization header)
      2. Secure invite token (provided in JSON body as invite_token)
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "Invalid JSON payload."
        }), 400

    fcm_token = data.get('fcm_token') or data.get('fcmToken') or data.get('token')
    if not fcm_token or not str(fcm_token).strip():
        return jsonify({
            "success": False,
            "message": "FCM device token is required."
        }), 400

    contact_id = data.get('contact_id') or data.get('contactId')
    try:
        contact_id = int(contact_id) if contact_id is not None else None
    except (ValueError, TypeError):
        contact_id = None

    invite_token = data.get('invite_token') or data.get('inviteToken')

    # Case A: Registration via signed invite token
    if invite_token:
        is_valid, user_doc, contact_record, err = EmergencyService.verify_invite_token(invite_token)
        if not is_valid:
            return jsonify({
                "success": False,
                "message": err or "Invalid or expired invite token."
            }), 401

        user_id = str(user_doc["_id"])
        target_contact_id = contact_record.get("id")
        result = EmergencyService.register_contact_token(user_id, fcm_token, target_contact_id)
        status_code = result.pop("status_code", 200)
        return jsonify(result), status_code

    # Case B: Registration via authenticated user session
    auth_header = request.headers.get('Authorization')
    token = None
    if auth_header:
        parts = auth_header.split(' ')
        if len(parts) == 2 and parts[0].lower() == 'bearer':
            token = parts[1]
        elif len(parts) == 1:
            token = parts[0]
    if not token:
        token = request.headers.get('x-access-token')
    if not token:
        token = request.cookies.get('token')

    if not token:
        return jsonify({
            "success": False,
            "message": "Authentication required. Please log in or provide a valid invite token."
        }), 401

    try:
        payload = decode_token(token)
        user_id = payload.get("user_id")
    except Exception:
        return jsonify({
            "success": False,
            "message": "Invalid or expired authentication token."
        }), 401

    result = EmergencyService.register_contact_token(user_id, fcm_token, contact_id)
    status_code = result.pop("status_code", 200)
    return jsonify(result), status_code


@notification_bp.route('/invite-token', methods=['POST'])
@token_required
def create_contact_invite_token(current_user):
    """
    Creates a signed 7-day registration invite token for a specified contact.
    Allows emergency contacts to enable device notifications without needing account credentials.
    """
    data = request.get_json(silent=True) or {}
    contact_id = data.get('contact_id') or data.get('contactId')

    if contact_id is None:
        # Default to primary contact
        contacts = current_user.get('emergencyContacts', [])
        for c in contacts:
            if c.get('isPrimary'):
                contact_id = c.get('id')
                break
        if contact_id is None and contacts:
            contact_id = contacts[0].get('id')

    if contact_id is None:
        return jsonify({
            "success": False,
            "message": "No emergency contacts configured to generate invite for."
        }), 400

    token = EmergencyService.generate_invite_token(current_user['id'], int(contact_id))
    return jsonify({
        "success": True,
        "contact_id": int(contact_id),
        "invite_token": token
    }), 200


@notification_bp.route('/verify-invite', methods=['GET'])
def verify_invite_token():
    """
    Verifies an invite token and returns details for the contact onboarding view.
    """
    token = request.args.get('token')
    if not token:
        return jsonify({
            "success": False,
            "message": "Invite token parameter 'token' is required."
        }), 400

    is_valid, user_doc, contact_record, err = EmergencyService.verify_invite_token(token)
    if not is_valid:
        return jsonify({
            "success": False,
            "message": err or "Invalid invite token."
        }), 400

    return jsonify({
        "success": True,
        "user_name": user_doc.get("name", "EchoHand User"),
        "contact_name": contact_record.get("name", "Contact"),
        "relation": contact_record.get("relation", "Family / Friend")
    }), 200


# ── Emergency Alert Endpoints ───────────────────────────────────────

@emergency_bp.route('/alert', methods=['POST'])
@token_required
def trigger_emergency_alert(current_user):
    """
    Dispatches emergency alert to registered contacts via Firebase Cloud Messaging.
    Accepts:
      - source: 'gesture' | 'manual'
      - latitude: float (optional)
      - longitude: float (optional)
    Determines user and contacts securely from authenticated user session.
    """
    data = request.get_json(silent=True) or {}

    source = data.get('source', 'manual')
    lat = data.get('latitude') or data.get('lat')
    lng = data.get('longitude') or data.get('lng')

    result = EmergencyService.send_emergency_alert(
        user_id=current_user['id'],
        source=source,
        lat=lat,
        lng=lng
    )

    status_code = result.pop("status_code", 200)
    return jsonify(result), status_code
