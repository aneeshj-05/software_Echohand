from functools import wraps
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from flask import request, jsonify
from backend.config import Config


def hash_password(password: str) -> str:
    """
    Hashes a plaintext password using bcrypt with configured salt rounds.
    Returns the hashed password as a UTF-8 string.
    """
    if not password or not isinstance(password, str):
        raise ValueError("Password must be a non-empty string")
    
    salt = bcrypt.gensalt(rounds=Config.BCRYPT_LOG_ROUNDS)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def check_password(password: str, hashed_password: str) -> bool:
    """
    Verifies a plaintext password against a bcrypt hash in constant time.
    """
    if not password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def generate_token(user_id: str, email: str, name: str) -> str:
    """
    Generates a signed JWT containing user information with an expiration time.
    """
    now = datetime.now(timezone.utc)
    expiration = now + timedelta(hours=Config.JWT_EXPIRATION_HOURS)
    
    payload = {
        'sub': str(user_id),
        'user_id': str(user_id),
        'email': email.lower(),
        'name': name,
        'iat': int(now.timestamp()),
        'exp': int(expiration.timestamp())
    }
    
    token = jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm='HS256')
    return token


def decode_token(token: str) -> dict:
    """
    Decodes and validates a JWT token.
    Raises jwt.ExpiredSignatureError or jwt.InvalidTokenError on failure.
    """
    return jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=['HS256'])


def token_required(f):
    """
    Decorator to protect routes requiring authentication.
    Extracts Bearer token from 'Authorization' header or 'x-access-token' or cookie.
    Injects `current_user` dictionary containing payload into the handler.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # 1. Check Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header:
            parts = auth_header.split(' ')
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                token = parts[1]
            elif len(parts) == 1:
                token = parts[0]
                
        # 2. Check x-access-token header
        if not token:
            token = request.headers.get('x-access-token')
            
        # 3. Check cookies
        if not token:
            token = request.cookies.get('token')
            
        if not token:
            return jsonify({
                "success": False,
                "error": "Authentication token is missing. Please log in."
            }), 401
            
        try:
            payload = decode_token(token)
            # Find the user in database to ensure account still exists and is active
            from backend.utils.db import get_db
            from bson import ObjectId
            
            db = get_db()
            user_doc = None
            try:
                user_doc = db.users.find_one({"_id": ObjectId(payload['user_id'])})
            except Exception:
                pass
                
            if not user_doc:
                return jsonify({
                    "success": False,
                    "error": "User account associated with this token was not found."
                }), 401
                
            # Attach clean user profile to request context
            from backend.models.user_model import UserModel
            current_user = UserModel.to_dict(user_doc)
            
        except jwt.ExpiredSignatureError:
            return jsonify({
                "success": False,
                "error": "Your session has expired. Please log in again."
            }), 401
        except jwt.InvalidTokenError:
            return jsonify({
                "success": False,
                "error": "Invalid authentication token. Please log in again."
            }), 401
        except Exception as e:
            return jsonify({
                "success": False,
                "error": f"Authentication failed: {str(e)}"
            }), 401
            
        return f(current_user, *args, **kwargs)
        
    return decorated
