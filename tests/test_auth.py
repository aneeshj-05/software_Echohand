import unittest
import json
from unittest.mock import patch, MagicMock
from bson import ObjectId

from backend.app import create_app
from backend.utils.security import hash_password, check_password, generate_token, decode_token
from backend.utils.validators import validate_email, validate_password, validate_signup_input, validate_login_input
from backend.models.user_model import UserModel


class TestSecurityUtils(unittest.TestCase):
    def test_password_hashing(self):
        password = "SecurePassword123!"
        hashed = hash_password(password)
        self.assertNotEqual(password, hashed)
        self.assertTrue(check_password(password, hashed))
        self.assertFalse(check_password("WrongPassword!", hashed))

    def test_jwt_token(self):
        user_id = str(ObjectId())
        email = "test@echohand.org"
        name = "Amrutha"
        token = generate_token(user_id, email, name)
        self.assertTrue(isinstance(token, str))
        decoded = decode_token(token)
        self.assertEqual(decoded['user_id'], user_id)
        self.assertEqual(decoded['email'], email)
        self.assertEqual(decoded['name'], name)


class TestValidators(unittest.TestCase):
    def test_email_validation(self):
        valid, _ = validate_email("user@example.com")
        self.assertTrue(valid)
        invalid, _ = validate_email("not-an-email")
        self.assertFalse(invalid)

    def test_password_validation(self):
        valid, _ = validate_password("12345678")
        self.assertTrue(valid)
        invalid, _ = validate_password("short")
        self.assertFalse(invalid)

    def test_signup_validation_success(self):
        data = {
            "fullName": "Jane Doe",
            "email": "jane@example.com",
            "phone": "+1 555 0100",
            "password": "Password123",
            "confirmPassword": "Password123",
            "emergencyContacts": [
                {"name": "John Doe", "phone": "+1 555 0199", "relation": "Caregiver", "isPrimary": True}
            ]
        }
        is_valid, errors, cleaned = validate_signup_input(data)
        self.assertTrue(is_valid, f"Validation errors: {errors}")
        self.assertEqual(cleaned['name'], "Jane Doe")
        self.assertEqual(cleaned['email'], "jane@example.com")
        self.assertEqual(len(cleaned['emergency_contacts']), 1)

    def test_signup_password_mismatch(self):
        data = {
            "fullName": "Jane Doe",
            "email": "jane@example.com",
            "password": "Password123",
            "confirmPassword": "DifferentPassword"
        }
        is_valid, errors, _ = validate_signup_input(data)
        self.assertFalse(is_valid)
        self.assertIn("confirmPassword", errors)


class TestAuthRoutes(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    @patch('backend.utils.db.get_db')
    @patch('backend.services.auth_service.get_db')
    def test_register_and_login_flow(self, mock_auth_db, mock_util_db):
        # Mock MongoDB
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_auth_db.return_value = mock_db
        mock_util_db.return_value = mock_db

        # User does not exist initially
        mock_users.find_one.return_value = None
        fake_id = ObjectId()
        mock_users.insert_one.return_value = MagicMock(inserted_id=fake_id)

        # 1. Register
        signup_payload = {
            "fullName": "Amrutha Rao",
            "email": "amrutha@echohand.org",
            "phone": "+91 9876543210",
            "password": "SecurePassword123",
            "confirmPassword": "SecurePassword123",
            "emergencyContacts": [
                {"name": "Priya", "phone": "+91 9876543211", "relation": "Parent / Family", "isPrimary": True}
            ]
        }

        resp = self.client.post(
            '/api/auth/register',
            data=json.dumps(signup_payload),
            content_type='application/json'
        )
        self.assertEqual(resp.status_code, 201)
        res_data = resp.get_json()
        self.assertTrue(res_data['success'])
        self.assertIn('token', res_data)
        self.assertEqual(res_data['user']['name'], "Amrutha Rao")

        # 2. Login
        # Mock finding user in DB with valid hashed password
        hashed_pw = hash_password("SecurePassword123")
        mock_users.find_one.return_value = {
            "_id": fake_id,
            "name": "Amrutha Rao",
            "email": "amrutha@echohand.org",
            "phone": "+91 9876543210",
            "password_hash": hashed_pw,
            "emergency_contacts": [
                {"id": 1, "name": "Priya", "phone": "+91 9876543211", "relation": "Parent / Family", "is_primary": True}
            ]
        }

        login_payload = {
            "email": "amrutha@echohand.org",
            "password": "SecurePassword123"
        }

        login_resp = self.client.post(
            '/api/auth/login',
            data=json.dumps(login_payload),
            content_type='application/json'
        )
        self.assertEqual(login_resp.status_code, 200)
        login_data = login_resp.get_json()
        self.assertTrue(login_data['success'])
        token = login_data['token']

        # 3. Protected /me route
        me_resp = self.client.get(
            '/api/auth/me',
            headers={'Authorization': f'Bearer {token}'}
        )
        self.assertEqual(me_resp.status_code, 200)
        me_data = me_resp.get_json()
        self.assertEqual(me_data['user']['email'], "amrutha@echohand.org")

    def test_health_endpoint(self):
        resp = self.client.get('/api/health')
        self.assertIn(resp.status_code, [200, 503])
        data = resp.get_json()
        self.assertEqual(data['status'], 'online')

    @patch('backend.services.auth_service.get_db')
    def test_duplicate_registration_returns_409(self, mock_auth_db):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_auth_db.return_value = mock_db

        # User already exists
        mock_users.find_one.return_value = {"_id": ObjectId(), "email": "existing@echohand.org"}

        signup_payload = {
            "fullName": "Existing User",
            "email": "existing@echohand.org",
            "password": "Password123",
            "confirmPassword": "Password123"
        }

        resp = self.client.post(
            '/api/auth/register',
            data=json.dumps(signup_payload),
            content_type='application/json'
        )
        self.assertEqual(resp.status_code, 409)
        data = resp.get_json()
        self.assertFalse(data['success'])

    @patch('backend.services.auth_service.get_db')
    def test_login_invalid_password_returns_401(self, mock_auth_db):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_auth_db.return_value = mock_db

        hashed_pw = hash_password("CorrectPassword123")
        mock_users.find_one.return_value = {
            "_id": ObjectId(),
            "name": "Amrutha",
            "email": "amrutha@echohand.org",
            "password_hash": hashed_pw
        }

        login_payload = {
            "email": "amrutha@echohand.org",
            "password": "WrongPassword123"
        }

        resp = self.client.post(
            '/api/auth/login',
            data=json.dumps(login_payload),
            content_type='application/json'
        )
        self.assertEqual(resp.status_code, 401)
        data = resp.get_json()
        self.assertFalse(data['success'])

    @patch('backend.services.auth_service.get_db')
    def test_login_nonexistent_email_returns_401(self, mock_auth_db):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_auth_db.return_value = mock_db

        mock_users.find_one.return_value = None

        login_payload = {
            "email": "notfound@echohand.org",
            "password": "AnyPassword123"
        }

        resp = self.client.post(
            '/api/auth/login',
            data=json.dumps(login_payload),
            content_type='application/json'
        )
        self.assertEqual(resp.status_code, 401)
        data = resp.get_json()
        self.assertFalse(data['success'])

    def test_protected_route_missing_token_returns_401(self):
        resp = self.client.get('/api/auth/me')
        self.assertEqual(resp.status_code, 401)
        data = resp.get_json()
        self.assertFalse(data['success'])

    def test_protected_route_invalid_token_returns_401(self):
        resp = self.client.get('/api/auth/me', headers={'Authorization': 'Bearer invalid.token.value'})
        self.assertEqual(resp.status_code, 401)
        data = resp.get_json()
        self.assertFalse(data['success'])


if __name__ == '__main__':
    unittest.main()

