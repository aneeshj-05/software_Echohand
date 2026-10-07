import re
import html

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$')
PHONE_REGEX = re.compile(r'^[+\d][\d\s\-().]{6,24}$')


def sanitize_string(val: str) -> str:
    """Strips leading/trailing whitespace and escapes dangerous HTML characters."""
    if not val or not isinstance(val, str):
        return ""
    return html.escape(val.strip())


def validate_email(email: str):
    """
    Validates email format and length.
    Returns (is_valid: bool, error_message: str or None)
    """
    if not email or not isinstance(email, str):
        return False, "Email address is required."
    
    clean_email = email.strip()
    if len(clean_email) > 254:
        return False, "Email address exceeds maximum length of 254 characters."
    
    if not EMAIL_REGEX.match(clean_email):
        return False, "Please enter a valid email address (e.g. name@example.com)."
    
    return True, None


def validate_password(password: str, min_length: int = 8):
    """
    Validates password strength.
    Requires minimum length of 8 characters (matches frontend requirement).
    Returns (is_valid: bool, error_message: str or None)
    """
    if not password or not isinstance(password, str):
        return False, "Password is required."
    
    if len(password) < min_length:
        return False, f"Password must be at least {min_length} characters long."
    
    if len(password) > 128:
        return False, "Password must not exceed 128 characters."
        
    return True, None


def validate_phone(phone: str, field_name: str = "Phone number"):
    """
    Validates international or local telephone number format.
    Accepts formats like: +91 9876543210, +1 555-0100, 07911123456
    """
    if not phone or not isinstance(phone, str):
        return False, f"{field_name} is required."
    
    clean_phone = phone.strip()
    if not PHONE_REGEX.match(clean_phone):
        return False, f"Please enter a valid {field_name.lower()} (e.g. +1 555 0100)."
    
    return True, None


def validate_signup_input(data: dict):
    """
    Comprehensive validation for the signup payload from login.html.
    Accepts both camelCase and snake_case keys.
    Returns (is_valid: bool, errors: dict, cleaned_data: dict)
    """
    errors = {}
    cleaned = {}

    if not isinstance(data, dict):
        return False, {"general": "Invalid request body format. JSON object expected."}, {}

    # 1. Full Name
    raw_name = data.get('fullName') or data.get('name') or data.get('full_name')
    if not raw_name or not str(raw_name).strip():
        errors['fullName'] = "Full name is required."
    else:
        cleaned['name'] = sanitize_string(str(raw_name))
        if len(cleaned['name']) < 2:
            errors['fullName'] = "Full name must be at least 2 characters."
        elif len(cleaned['name']) > 100:
            errors['fullName'] = "Full name must not exceed 100 characters."

    # 2. Email
    raw_email = data.get('email') or data.get('loginEmail') or data.get('signupEmail')
    is_valid_email, email_err = validate_email(raw_email)
    if not is_valid_email:
        errors['email'] = email_err
    else:
        cleaned['email'] = str(raw_email).strip().lower()

    # 3. User Phone (present in login.html #signupPhone)
    raw_phone = data.get('phone') or data.get('signupPhone')
    if raw_phone:
        is_valid_phone, phone_err = validate_phone(raw_phone, "User phone number")
        if not is_valid_phone:
            errors['phone'] = phone_err
        else:
            cleaned['phone'] = str(raw_phone).strip()
    else:
        cleaned['phone'] = ""

    # 4. Password & Confirm Password
    raw_password = data.get('password') or data.get('signupPassword')
    raw_confirm = data.get('confirmPassword') or data.get('signupConfirmPassword')

    is_valid_pass, pass_err = validate_password(raw_password, min_length=8)
    if not is_valid_pass:
        errors['password'] = pass_err
    else:
        cleaned['password'] = raw_password

    if raw_confirm is not None and raw_password != raw_confirm:
        errors['confirmPassword'] = "Passwords do not match."

    # 5. Preferred Input (optional, defaults to 'both')
    cleaned['preferred_input'] = data.get('preferredInput') or data.get('preferred_input') or 'both'

    # 6. Emergency Contacts
    raw_contacts = data.get('emergencyContacts') or data.get('emergency_contacts')
    contacts_list = []

    if isinstance(raw_contacts, list) and len(raw_contacts) > 0:
        for idx, contact in enumerate(raw_contacts):
            if not isinstance(contact, dict):
                continue
            c_name = sanitize_string(contact.get('name', ''))
            c_phone = str(contact.get('phone', '')).strip()
            c_rel = sanitize_string(contact.get('relation', 'Parent / Family'))
            c_primary = bool(contact.get('isPrimary', idx == 0))
            raw_tokens = contact.get('fcm_tokens', contact.get('fcmTokens', []))
            c_tokens = [str(t).strip() for t in raw_tokens if isinstance(t, str) and str(t).strip()] if isinstance(raw_tokens, list) else []

            if not c_name:
                errors[f'emergencyContact_{idx}_name'] = f"Contact {idx + 1} name is required."
            if not c_phone or not PHONE_REGEX.match(c_phone):
                errors[f'emergencyContact_{idx}_phone'] = f"Contact {idx + 1} valid phone number is required."

            contacts_list.append({
                "id": idx + 1,
                "name": c_name,
                "phone": c_phone,
                "relation": c_rel,
                "is_primary": c_primary,
                "fcm_tokens": c_tokens
            })
    else:
        # Fallback to direct single fields: emergencyName, emergencyPhone, emergencyRelation
        em_name = data.get('emergencyName')
        em_phone = data.get('emergencyPhone')
        em_rel = data.get('emergencyRelation', 'Parent / Family')

        if em_name or em_phone:
            if not em_name or not str(em_name).strip():
                errors['emergencyName'] = "Emergency contact name is required."
            if not em_phone or not PHONE_REGEX.match(str(em_phone).strip()):
                errors['emergencyPhone'] = "Please enter a valid emergency contact phone number."

            if not errors.get('emergencyName') and not errors.get('emergencyPhone'):
                contacts_list.append({
                    "id": 1,
                    "name": sanitize_string(str(em_name)),
                    "phone": str(em_phone).strip(),
                    "relation": sanitize_string(str(em_rel)),
                    "is_primary": True,
                    "fcm_tokens": []
                })

    cleaned['emergency_contacts'] = contacts_list

    is_valid = len(errors) == 0
    return is_valid, errors, cleaned


def validate_coordinates(lat, lng):
    """
    Validates geographic coordinates (latitude and longitude).
    Allows None / null / empty if GPS was unavailable.
    Returns (is_valid: bool, cleaned_lat: float or None, cleaned_lng: float or None, error_msg: str or None)
    """
    if lat is None or lat == '' or lng is None or lng == '':
        return True, None, None, None

    try:
        f_lat = float(lat)
        f_lng = float(lng)
    except (ValueError, TypeError):
        return False, None, None, "Invalid coordinate format. Coordinates must be numeric."

    if not (-90.0 <= f_lat <= 90.0):
        return False, None, None, "Latitude must be between -90.0 and 90.0."

    if not (-180.0 <= f_lng <= 180.0):
        return False, None, None, "Longitude must be between -180.0 and 180.0."

    return True, f_lat, f_lng, None



def validate_login_input(data: dict):
    """
    Validation for login credentials.
    Returns (is_valid: bool, errors: dict, cleaned_data: dict)
    """
    errors = {}
    cleaned = {}

    if not isinstance(data, dict):
        return False, {"general": "Invalid request body. JSON object expected."}, {}

    raw_email = data.get('email') or data.get('loginEmail')
    raw_password = data.get('password') or data.get('loginPassword')

    if not raw_email or not str(raw_email).strip():
        errors['email'] = "Email address is required."
    else:
        cleaned['email'] = str(raw_email).strip().lower()

    if not raw_password:
        errors['password'] = "Password is required."
    else:
        cleaned['password'] = str(raw_password)

    is_valid = len(errors) == 0
    return is_valid, errors, cleaned
