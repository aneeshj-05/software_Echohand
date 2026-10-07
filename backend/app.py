import os
import logging
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from backend.config import Config
from backend.utils.db import init_db, check_db_connection
from backend.routes.auth_routes import auth_bp
from backend.routes.asl_routes import asl_bp
from backend.routes.emergency_routes import emergency_bp, notification_bp
from backend.services.firebase_service import init_firebase, get_resolved_admin_project_id
from backend.utils.firebase_admin_config import validate_firebase_admin_configuration

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("echohand")


def create_app():
    """Application factory for EchoHand Flask backend."""
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))

    app = Flask(__name__)
    app.config.from_object(Config)

    # Enable CORS for frontend integration
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization", "x-access-token"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    )

    # Register Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(asl_bp)
    app.register_blueprint(emergency_bp)
    app.register_blueprint(notification_bp)

    # Initialize DB indexes and Firebase Admin on startup (non-fatal if services deferred)
    with app.app_context():
        try:
            init_db()
        except Exception as err:
            logger.warning(f"MongoDB Atlas not reachable at startup: {err}")

        try:
            admin_ready, admin_project_id, admin_errors = validate_firebase_admin_configuration()
            if not admin_ready:
                for msg in admin_errors:
                    logger.error("Firebase Admin not ready at startup: %s", msg)
            elif not init_firebase(app):
                logger.error(
                    "Firebase Admin startup initialization failed. Emergency FCM alerts will not send "
                    "until FIREBASE_CREDENTIALS_PATH and FIREBASE_PROJECT_ID are configured."
                )
            else:
                logger.info(
                    "Firebase Admin ready for FCM (project_id=%s).",
                    admin_project_id or get_resolved_admin_project_id(),
                )
        except Exception as err:
            logger.warning("Firebase Admin initialization deferred: %s", err)

    # Global Health Check Endpoint
    @app.route('/api/health', methods=['GET'])
    def health_check():
        db_connected, db_msg = check_db_connection()
        return jsonify({
            "status": "online",
            "service": "EchoHand Assistive Backend",
            "database": {
                "connected": db_connected,
                "message": db_msg
            }
        }), (200 if db_connected else 503)

    # Error handlers for standardized JSON responses
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({
            "success": False,
            "error": "The requested resource was not found."
        }), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({
            "success": False,
            "error": "HTTP method not allowed for this endpoint."
        }), 405

    @app.errorhandler(500)
    def internal_error(e):
        logger.error(f"Internal Server Error: {str(e)}")
        return jsonify({
            "success": False,
            "error": "An internal server error occurred. Please try again later."
        }), 500

    @app.route('/')
    def index():
        return send_from_directory(frontend_dir, 'index.html')

    @app.route('/firebase-messaging-sw.js')
    def serve_sw():
        target = os.path.join(frontend_dir, 'firebase-messaging-sw.js')
        if os.path.isfile(target):
            resp = send_from_directory(frontend_dir, 'firebase-messaging-sw.js', mimetype='application/javascript')
            resp.headers['Service-Worker-Allowed'] = '/'
            resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            return resp
        return jsonify({"error": "Service worker file not found"}), 404

    @app.route('/<path:filename>')
    def serve_frontend(filename):
        for candidate in [filename, filename + '.html']:
            target = os.path.join(frontend_dir, candidate)
            if os.path.isfile(target):
                resp = send_from_directory(frontend_dir, candidate)
                if 'firebase-messaging-sw.js' in candidate:
                    resp.headers['Service-Worker-Allowed'] = '/'
                    resp.headers['Content-Type'] = 'application/javascript'
                return resp
        return send_from_directory(frontend_dir, 'index.html')

    # Add security response headers
    @app.after_request
    def set_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        return response

    return app


# Create the application instance
app = create_app()

if __name__ == '__main__':
    # Initialize DB connection and indexes
    try:
        init_db(app)
    except Exception as err:
        logger.warning(f"Could not connect to MongoDB Atlas at startup: {err}")

    port = Config.PORT
    debug = Config.DEBUG
    logger.info(f"Starting EchoHand Authentication Backend on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=debug)
