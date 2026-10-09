import logging
from datetime import datetime, timezone
from bson import ObjectId
from pymongo.errors import DuplicateKeyError, PyMongoError

from backend.utils.db import get_db
from backend.utils.security import hash_password, check_password, generate_token
from backend.utils.validators import validate_signup_input, validate_login_input
from backend.models.user_model import UserModel

logger = logging.getLogger(__name__)

# Pre-computed dummy hash to prevent timing attacks when an email does not exist
DUMMY_BCRYPT_HASH = "$2b$12$e80MvI6nBqXo1E/b5yV72.cO43l8b5pP1I3H4QzY7sM6R2XvA4uKm"


class AuthService:
    """Service handling all authentication and user persistence workflows."""

    @staticmethod
    def register_user(raw_data: dict):
        """
        Validates input, checks duplicates, hashes password, saves to MongoDB,
        and generates an authentication token.
        """
        # 1. Validation
        is_valid, errors, cleaned = validate_signup_input(raw_data)
        if not is_valid:
            return {
                "success": False,
                "status_code": 400,
                "message": "Validation failed. Please correct the highlighted errors.",
                "errors": errors
            }

        # 2. Database connectivity
        try:
            db = get_db()
        except Exception as e:
            logger.error(f"Database error during registration: {str(e)}")
            return {
                "success": False,
                "status_code": 503,
                "message": "Database service is temporarily unavailable. Please try again shortly."
            }

        # 3. Check duplicate email
        normalized_email = cleaned['email']
        existing_user = db.users.find_one({"email": normalized_email})
        if existing_user:
            return {
                "success": False,
                "status_code": 409,
                "message": "An account with this email address already exists. Please log in instead.",
                "errors": {"email": "This email address is already registered."}
            }

        # 4. Hash password securely
        try:
            pw_hash = hash_password(cleaned['password'])
        except Exception as e:
            logger.error(f"Password hashing failure: {str(e)}")
            return {
                "success": False,
                "status_code": 500,
                "message": "Failed to secure password. Please try again."
            }

        # 5. Build and insert document
        user_doc = UserModel.create_document(
            name=cleaned['name'],
            email=normalized_email,
            password_hash=pw_hash,
            phone=cleaned.get('phone', ''),
            preferred_input=cleaned.get('preferred_input', 'both'),
            emergency_contacts=cleaned.get('emergency_contacts', [])
        )

        try:
            insert_result = db.users.insert_one(user_doc)
            user_doc['_id'] = insert_result.inserted_id
        except DuplicateKeyError:
            return {
                "success": False,
                "status_code": 409,
                "message": "An account with this email address already exists.",
                "errors": {"email": "This email address is already registered."}
            }
        except PyMongoError as e:
            logger.error(f"MongoDB insertion error: {str(e)}")
            return {
                "success": False,
                "status_code": 500,
                "message": "Failed to create user account in database."
            }

        # 6. Issue JWT Token
        user_id_str = str(user_doc['_id'])
        token = generate_token(
            user_id=user_id_str,
            email=normalized_email,
            name=user_doc['name']
        )

        serialized_user = UserModel.to_dict(user_doc)

        return {
            "success": True,
            "status_code": 201,
            "message": f"Welcome to EchoHand, {user_doc['name']}! Account created successfully.",
            "token": token,
            "user": serialized_user
        }

    @staticmethod
    def login_user(raw_data: dict):
        """
        Validates login credentials, checks bcrypt password hash in constant time,
        updates login timestamp, and issues JWT token.
        """
        # 1. Validation
        is_valid, errors, cleaned = validate_login_input(raw_data)
        if not is_valid:
            return {
                "success": False,
                "status_code": 400,
                "message": "Please provide both email and password.",
                "errors": errors
            }

        # 2. Database query
        try:
            db = get_db()
        except Exception as e:
            logger.error(f"Database error during login: {str(e)}")
            return {
                "success": False,
                "status_code": 503,
                "message": "Database service is temporarily unavailable. Please try again shortly."
            }

        normalized_email = cleaned['email']
        user_doc = db.users.find_one({"email": normalized_email})

        # 3. Constant-time password verification (mitigate timing attacks)
        if not user_doc:
            check_password(cleaned['password'], DUMMY_BCRYPT_HASH)
            return {
                "success": False,
                "status_code": 401,
                "message": "Invalid email address or password.",
                "errors": {"credentials": "Invalid email or password."}
            }

        is_password_valid = check_password(cleaned['password'], user_doc.get('password_hash', ''))
        if not is_password_valid:
            return {
                "success": False,
                "status_code": 401,
                "message": "Invalid email address or password.",
                "errors": {"credentials": "Invalid email or password."}
            }

        # 4. Update last_login
        now = datetime.now(timezone.utc)
        try:
            db.users.update_one(
                {"_id": user_doc["_id"]},
                {"$set": {"last_login": now}}
            )
            user_doc["last_login"] = now
        except PyMongoError as e:
            logger.warning(f"Could not update last_login: {str(e)}")

        # 5. Issue JWT Token
        user_id_str = str(user_doc['_id'])
        token = generate_token(
            user_id=user_id_str,
            email=user_doc['email'],
            name=user_doc['name']
        )

        serialized_user = UserModel.to_dict(user_doc)

        return {
            "success": True,
            "status_code": 200,
            "message": f"Welcome back, {user_doc['name']}! Login successful.",
            "token": token,
            "user": serialized_user
        }

    @staticmethod
    def get_user_profile(user_id: str):
        """Fetches the user profile by ID."""
        try:
            db = get_db()
            user_doc = db.users.find_one({"_id": ObjectId(user_id)})
            if not user_doc:
                return None
            return UserModel.to_dict(user_doc)
        except Exception as e:
            logger.error(f"Error fetching user profile: {str(e)}")
            return None

    @staticmethod
    def update_emergency_contacts(user_id: str, contacts: list):
        """Updates emergency contacts list for a user, preserving registered FCM tokens."""
        try:
            db = get_db()
            now = datetime.now(timezone.utc)
            user_doc = db.users.find_one({"_id": ObjectId(user_id)})
            existing_tokens_by_id = {}
            if user_doc:
                for c in user_doc.get("emergency_contacts", []):
                    c_id = c.get("id")
                    if c_id is not None:
                        existing_tokens_by_id[c_id] = c.get("fcm_tokens", [])

            cleaned_contacts = []
            for idx, c in enumerate(contacts):
                c_id = c.get("id", idx + 1)
                tokens = c.get("fcm_tokens") or c.get("fcmTokens")
                if tokens is None:
                    tokens = existing_tokens_by_id.get(c_id, [])
                cleaned_contacts.append({
                    "id": c_id,
                    "name": c.get("name", ""),
                    "phone": c.get("phone", ""),
                    "relation": c.get("relation", "Parent / Family"),
                    "is_primary": bool(c.get("is_primary", c.get("isPrimary", idx == 0))),
                    "fcm_tokens": tokens if isinstance(tokens, list) else []
                })

            db.users.update_one(
                {"_id": ObjectId(user_id)},
                {
                    "$set": {
                        "emergency_contacts": cleaned_contacts,
                        "updated_at": now
                    }
                }
            )
            return True
        except Exception as e:
            logger.error(f"Error updating emergency contacts: {str(e)}")
            return False
