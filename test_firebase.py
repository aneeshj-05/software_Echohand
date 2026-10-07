import firebase_admin
from firebase_admin import credentials

if not firebase_admin._apps:
    firebase_admin.initialize_app()

print("Firebase Admin SDK initialized successfully!")