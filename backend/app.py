import os
import logging
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from backend.config import Config
from backend.utils.db import init_db, check_db_connection
from backend.routes.auth_routes import auth_bp

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("echohand")


def create_app():
    """Application factory for EchoHand Flask backend."""
    # Resolve frontend1 directory path for direct preview if desired
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend1'))
    
    app = Flask(
        __name__,
        static_folder=frontend_dir,
        static_url_path=''
    )
    
    # Load configuration
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

    # Serve frontend files if accessed via Flask server
    @app.route('/')
    def index():
        return send_from_directory(frontend_dir, 'index.html')

    @app.route('/<path:filename>')
    def serve_frontend(filename):
        target = os.path.join(frontend_dir, filename)
        if os.path.isfile(target):
            return send_from_directory(frontend_dir, filename)
        return jsonify({"error": "Page not found"}), 404

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
