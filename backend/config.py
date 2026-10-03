import os
from pathlib import Path
from dotenv import load_dotenv

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
