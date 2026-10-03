from datetime import datetime, timezone
from bson import ObjectId


class UserModel:
    """
    MongoDB User Document schema and serialization utilities.
    Ensures consistent data representation across MongoDB Atlas and API responses.
    """

    @staticmethod
    def create_document(
        name: str,
        email: str,
        password_hash: str,
        phone: str = "",
        preferred_input: str = "both",
        emergency_contacts: list = None
    ) -> dict:
        """
        Creates a new user document structured for MongoDB Atlas insertion.
        """
        now = datetime.now(timezone.utc)
        return {
            "name": name.strip(),
            "email": email.strip().lower(),
            "phone": phone.strip() if phone else "",
            "password_hash": password_hash,
            "preferred_input": preferred_input or "both",
            "emergency_contacts": emergency_contacts or [],
            "created_at": now,
            "updated_at": now,
            "last_login": None,
            "is_active": True
        }

    @staticmethod
    def to_dict(user_doc: dict) -> dict:
        """
        Converts a MongoDB document to a secure, JSON-serializable dictionary.
        Strictly excludes sensitive attributes such as password_hash.
        Formats emergency contacts and fields to match frontend expectations.
        """
        if not user_doc:
            return None

        # Convert ObjectId to string
        user_id = str(user_doc.get("_id", ""))

        # Format timestamps
        created_at = user_doc.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()

        updated_at = user_doc.get("updated_at")
        if isinstance(updated_at, datetime):
            updated_at = updated_at.isoformat()

        last_login = user_doc.get("last_login")
        if isinstance(last_login, datetime):
            last_login = last_login.isoformat()

        # Format contacts
        raw_contacts = user_doc.get("emergency_contacts", [])
        formatted_contacts = []
        for c in raw_contacts:
            formatted_contacts.append({
                "id": c.get("id", 1),
                "name": c.get("name", ""),
                "phone": c.get("phone", ""),
                "relation": c.get("relation", "Parent / Family"),
                "isPrimary": c.get("is_primary", True)
            })

        return {
            "id": user_id,
            "name": user_doc.get("name", ""),
            "email": user_doc.get("email", ""),
            "phone": user_doc.get("phone", ""),
            "preferredInput": user_doc.get("preferred_input", "both"),
            "emergencyContacts": formatted_contacts,
            "emergency_contacts": formatted_contacts,
            "createdAt": created_at,
            "registeredAt": created_at,  # matches frontend auth-page.js property
            "lastLogin": last_login
        }
