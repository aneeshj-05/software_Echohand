import os
from pathlib import Path
from dotenv import load_dotenv

from backend.utils.firebase_client_config import read_firebase_admin_project_id


def _env(name: str, default: str = "") -> str:
    """Read env var with optional surrounding quotes stripped."""
    raw = os.getenv(name, default)
    if raw is None:
        return ""
    return str(raw).strip().strip('"').strip("'")

# Search for .env in current directory or backend directory or project root
base_dir = Path(__file__).resolve().parent
root_dir = base_dir.parent

env_paths = [
    base_dir / '.env',
    root_dir / '.env'
]

for env_path in env_paths:
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        break


class Config:
    """Base application configuration loaded from environment variables."""
    
    # General
    ENV = os.getenv('FLASK_ENV', 'development')
    DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() in ('true', '1', 't')
    SECRET_KEY = os.getenv('SECRET_KEY', 'echohand-dev-secret-key-change-in-production')
    
    # MongoDB Atlas Configuration
    MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb+srv://<username>:<password>@cluster.mongodb.net/echohand?retryWrites=true&w=majority')
    DATABASE_NAME = os.getenv('DATABASE_NAME', 'echohand')
    
    # JWT Configuration
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'echohand-jwt-super-secret-key-2026')
    JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', '168'))  # 7 days
    
    # Security / Bcrypt
    BCRYPT_LOG_ROUNDS = int(os.getenv('BCRYPT_LOG_ROUNDS', '12'))
    
    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')
    
    # Server port
    PORT = int(os.getenv('PORT', '5000'))

    # Firebase Admin SDK & Web Push Configuration
    _RAW_FIREBASE_CREDENTIALS_PATH = (
        _env('FIREBASE_CREDENTIALS_PATH') or _env('GOOGLE_APPLICATION_CREDENTIALS')
    )
    # Resolved after firebase_admin_config is importable (see end of module).
    FIREBASE_CREDENTIALS_PATH = _RAW_FIREBASE_CREDENTIALS_PATH
    FIREBASE_API_KEY = _env('FIREBASE_API_KEY')
    FIREBASE_PROJECT_ID = _env('FIREBASE_PROJECT_ID')
    FIREBASE_MESSAGING_SENDER_ID = _env('FIREBASE_MESSAGING_SENDER_ID')
    FIREBASE_APP_ID = _env('FIREBASE_APP_ID')
    FIREBASE_VAPID_KEY = _env('FIREBASE_VAPID_KEY')
    FIREBASE_AUTH_DOMAIN = _env('FIREBASE_AUTH_DOMAIN') or (
        f"{FIREBASE_PROJECT_ID}.firebaseapp.com" if FIREBASE_PROJECT_ID else ""
    )
    FIREBASE_STORAGE_BUCKET = _env('FIREBASE_STORAGE_BUCKET') or (
        f"{FIREBASE_PROJECT_ID}.appspot.com" if FIREBASE_PROJECT_ID else ""
    )
    # Populated after path normalization (see _apply_normalized_firebase_credentials_path).
    FIREBASE_ADMIN_PROJECT_ID = None


def _apply_normalized_firebase_credentials_path() -> None:
    from backend.utils.firebase_admin_config import resolve_service_account_path, resolve_admin_project_id

    resolved = resolve_service_account_path()
    if resolved:
        Config.FIREBASE_CREDENTIALS_PATH = resolved
    Config.FIREBASE_ADMIN_PROJECT_ID = resolve_admin_project_id()


_apply_normalized_firebase_credentials_path()

