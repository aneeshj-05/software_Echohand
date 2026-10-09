import logging
from pymongo import MongoClient, ASCENDING
from pymongo.errors import ConnectionFailure, ConfigurationError, ServerSelectionTimeoutError
from backend.config import Config

logger = logging.getLogger(__name__)

_mongo_client = None
_database = None
_last_uri = None  # track URI so a config change forces reconnect


def get_client():
    """Returns the singleton MongoClient instance."""
    global _mongo_client, _database, _last_uri
    if _mongo_client is not None and _last_uri == Config.MONGODB_URI:
        return _mongo_client
    # URI changed or first call — (re)connect
    if _mongo_client is not None:
        try: _mongo_client.close()
        except Exception: pass
    _mongo_client = None
    _database = None
    if _mongo_client is None:
        try:
            logger.info("Initializing MongoDB Atlas connection...")
            # If default placeholder connection string, provide helpful warning
            if "<username>" in Config.MONGODB_URI or "<password>" in Config.MONGODB_URI:
                logger.warning(
                    "[MONGODB WARNING] MONGODB_URI contains placeholder '<username>' or '<password>'. "
                    "Please update your .env with your real MongoDB Atlas connection string."
                )

            _mongo_client = MongoClient(
                Config.MONGODB_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                socketTimeoutMS=10000,
                retryWrites=True
            )
            _last_uri = Config.MONGODB_URI
        except Exception as e:
            logger.error(f"Failed to create MongoClient: {str(e)}")
            _mongo_client = None
            raise
    return _mongo_client


def get_db():
    """Returns the configured database instance."""
    global _database
    if _database is None:
        client = get_client()
        if client:
            _database = client[Config.DATABASE_NAME]
    return _database


def check_db_connection():
    """
    Pings MongoDB to verify active connection.
    Returns (status: bool, message: str)
    """
    try:
        client = get_client()
        if not client:
            return False, "MongoClient not initialized"
        client.admin.command('ping')
        return True, "Connected to MongoDB successfully"
    except (ConnectionFailure, ServerSelectionTimeoutError, ConfigurationError) as e:
        return False, f"MongoDB connection error: {str(e)}"
    except Exception as e:
        return False, f"Unexpected database error: {str(e)}"


def init_db(app=None):
    """
    Initializes database indexes and verifies connectivity.
    Called on application startup.
    """
    try:
        is_connected, message = check_db_connection()
        if is_connected:
            db = get_db()
            # Ensure unique index on email in 'users' collection
            db.users.create_index([("email", ASCENDING)], unique=True)
            # Create index on emergency contacts if queried frequently
            db.users.create_index([("created_at", ASCENDING)])
            logger.info("MongoDB Atlas indexes verified successfully.")
        else:
            logger.warning(f"MongoDB Atlas initialization warning: {message}")
            logger.warning("Ensure your MongoDB Atlas IP Access List (Network Access) allows connections from your current IP.")
    except Exception as e:
        logger.error(f"Error during init_db: {str(e)}")
