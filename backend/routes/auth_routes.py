import logging
from flask import Blueprint, request, jsonify, make_response
from backend.services.auth_service import AuthService
from backend.utils.security import token_required
from backend.utils.db import check_db_connection

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/register', methods=['POST'])
@auth_bp.route('/signup', methods=['POST'])
def register():
    """
    User Registration Endpoint.
    Accepts JSON payload matching the signup form in login.html.
    Fields:
      - fullName (or name)
      - email
      - phone
      - password
      - confirmPassword
      - emergencyContacts (list of { name, phone, relation, isPrimary })
        OR emergencyName, emergencyPhone, emergencyRelation
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({
            "success": False,
            "message": "Invalid JSON format in request body."
        }), 400

    result = AuthService.register_user(data)
    status_code = result.pop("status_code", 200)

    response = make_response(jsonify(result), status_code)
    
    # Optionally attach token to secure cookie for cookie-based clients
    if result.get("success") and result.get("token"):
        response.set_cookie(
            'token',
            result['token'],
            httponly=True,
            secure=False,  # Set to True in production with HTTPS
            samesite='Lax',
            max_age=7 * 24 * 3600
        )

    return response


@auth_bp.route('/login', methods=['POST'])
@auth_bp.route('/signin', methods=['POST'])
def login():
    """
    User Login Endpoint.
    Accepts JSON payload:
      - email (or loginEmail)
      - password (or loginPassword)
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({
            "success": False,
            "message": "Invalid JSON format in request body."
        }), 400

    result = AuthService.login_user(data)
    status_code = result.pop("status_code", 200)

    response = make_response(jsonify(result), status_code)

    if result.get("success") and result.get("token"):
        response.set_cookie(
            'token',
            result['token'],
            httponly=True,
            secure=False,
            samesite='Lax',
            max_age=7 * 24 * 3600
        )

    return response


@auth_bp.route('/me', methods=['GET'])
@token_required
def get_current_user(current_user):
    """
    Protected route to fetch authenticated user profile.
    Requires Bearer token in Authorization header or HTTP-only cookie.
    """
    return jsonify({
        "success": True,
        "user": current_user
    }), 200


@auth_bp.route('/emergency-contacts', methods=['PUT'])
@token_required
def update_emergency_contacts(current_user):
    """
    Protected route to update user emergency contacts.
    """
    data = request.get_json(silent=True)
    if not data or 'contacts' not in data:
        return jsonify({
            "success": False,
            "message": "Expected JSON payload with 'contacts' list."
        }), 400

    contacts = data.get('contacts', [])
    success = AuthService.update_emergency_contacts(current_user['id'], contacts)
    if success:
        return jsonify({
            "success": True,
            "message": "Emergency contacts updated successfully."
        }), 200
    else:
        return jsonify({
            "success": False,
            "message": "Failed to update emergency contacts."
        }), 500


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """
    Logout endpoint.
    Clears the authentication cookie and confirms logout.
    """
    response = make_response(jsonify({
        "success": True,
        "message": "Logged out successfully."
    }), 200)
    response.delete_cookie('token')
    return response


@auth_bp.route('/status', methods=['GET'])
def auth_status():
    """Returns status of authentication services and MongoDB Atlas connection."""
    is_connected, msg = check_db_connection()
    return jsonify({
        "status": "healthy" if is_connected else "degraded",
        "database": {
            "connected": is_connected,
            "message": msg
        }
    }), (200 if is_connected else 503)
