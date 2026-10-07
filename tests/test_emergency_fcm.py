import unittest
import json
from unittest.mock import patch, MagicMock
from bson import ObjectId
from datetime import datetime, timezone

from backend.app import create_app
from backend.utils.security import generate_token
from backend.services.firebase_service import FirebaseService, init_firebase, is_firebase_initialized
from backend.services.emergency_service import EmergencyService
from backend.utils.validators import validate_coordinates


class TestFirebaseInitialization(unittest.TestCase):
    @patch('backend.services.firebase_service.firebase_admin')
    @patch('backend.services.firebase_service.os.path.isfile', return_value=True)
    @patch('backend.services.firebase_service.credentials.Certificate')
    def test_firebase_init_with_cert(self, mock_cert, mock_isfile, mock_firebase_admin):
        mock_firebase_admin._apps = []
        with patch('backend.services.firebase_service.Config.FIREBASE_CREDENTIALS_PATH', 'dummy_creds.json'):
            result = init_firebase()
            self.assertTrue(result)
            mock_cert.assert_called_with('dummy_creds.json')
            mock_firebase_admin.initialize_app.assert_called_once()

    @patch('backend.services.firebase_service.firebase_admin')
    def test_firebase_init_already_initialized(self, mock_firebase_admin):
        mock_firebase_admin._apps = ['default_app']
        result = init_firebase()
        self.assertTrue(result)
        mock_firebase_admin.initialize_app.assert_not_called()

    @patch('backend.services.firebase_service.firebase_admin')
    def test_firebase_init_graceful_failure(self, mock_firebase_admin):
        mock_firebase_admin._apps = []
        mock_firebase_admin.initialize_app.side_effect = Exception("ADC not found")
        with patch('backend.services.firebase_service.Config.FIREBASE_CREDENTIALS_PATH', ''):
            with patch('os.getenv', return_value=''):
                result = init_firebase()
                self.assertFalse(result)


class TestCoordinateValidation(unittest.TestCase):
    def test_valid_coordinates(self):
        valid, lat, lng, err = validate_coordinates(12.9716, 77.5946)
        self.assertTrue(valid)
        self.assertEqual(lat, 12.9716)
        self.assertEqual(lng, 77.5946)
        self.assertIsNone(err)

    def test_none_coordinates(self):
        valid, lat, lng, err = validate_coordinates(None, None)
        self.assertTrue(valid)
        self.assertIsNone(lat)
        self.assertIsNone(lng)
        self.assertIsNone(err)

    def test_invalid_latitude_range(self):
        valid, _, _, err = validate_coordinates(95.0, 77.0)
        self.assertFalse(valid)
        self.assertIn("Latitude must be between -90.0 and 90.0", err)

    def test_invalid_longitude_range(self):
        valid, _, _, err = validate_coordinates(12.0, 195.0)
        self.assertFalse(valid)
        self.assertIn("Longitude must be between -180.0 and 180.0", err)

    def test_invalid_string_coordinates(self):
        valid, _, _, err = validate_coordinates("invalid_lat", "invalid_lng")
        self.assertFalse(valid)
        self.assertIn("Coordinates must be numeric", err)


class TestEmergencyEndpointsAndServices(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

        self.user_id = str(ObjectId())
        self.auth_token = generate_token(self.user_id, "testuser@echohand.org", "Aishwarya")

        self.mock_user = {
            "_id": ObjectId(self.user_id),
            "name": "Aishwarya",
            "email": "testuser@echohand.org",
            "phone": "+91 9876543210",
            "emergency_contacts": [
                {
                    "id": 1,
                    "name": "Yash",
                    "phone": "+91 9876543211",
                    "relation": "Trusted Friend",
                    "is_primary": True,
                    "fcm_tokens": ["token_yash_phone", "token_yash_laptop"]
                },
                {
                    "id": 2,
                    "name": "Doctor Rao",
                    "phone": "+91 9876543212",
                    "relation": "Healthcare Provider",
                    "is_primary": False,
                    "fcm_tokens": ["token_doc_tablet"]
                }
            ],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "last_login": None,
            "is_active": True
        }

    @patch('backend.utils.db.get_db')
    def test_register_device_token_authenticated(self, mock_db_getter):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_db_getter.return_value = mock_db

        mock_users.find_one.return_value = self.mock_user

        response = self.client.post(
            '/api/notifications/register',
            headers={'Authorization': f'Bearer {self.auth_token}'},
            json={
                "fcm_token": "new_device_token_12345",
                "contact_id": 1
            }
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertIn("Device notification successfully enabled for Yash", data['message'])
        mock_users.update_one.assert_called_once()

    def test_register_device_token_unauthenticated_rejected(self):
        response = self.client.post(
            '/api/notifications/register',
            json={"fcm_token": "token_without_auth"}
        )
        self.assertEqual(response.status_code, 401)

    @patch('backend.utils.db.get_db')
    def test_register_device_token_via_invite_token(self, mock_db_getter):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_db_getter.return_value = mock_db

        mock_users.find_one.return_value = self.mock_user

        # Generate a signed invite token for Contact 1
        invite_token = EmergencyService.generate_invite_token(self.user_id, 1)

        # Contact registers without Bearer authentication header
        response = self.client.post(
            '/api/notifications/register',
            json={
                "invite_token": invite_token,
                "fcm_token": "contact_phone_token_999"
            }
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertIn("Yash", data['message'])

    def test_emergency_alert_authentication_required(self):
        response = self.client.post(
            '/api/emergency/alert',
            json={"source": "manual"}
        )
        self.assertEqual(response.status_code, 401)

    @patch('backend.utils.db.get_db')
    def test_emergency_alert_coordinate_validation_rejection(self, mock_db_getter):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_db_getter.return_value = mock_db
        mock_users.find_one.return_value = self.mock_user

        response = self.client.post(
            '/api/emergency/alert',
            headers={'Authorization': f'Bearer {self.auth_token}'},
            json={
                "source": "manual",
                "latitude": 999.0,
                "longitude": 77.0
            }
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data['success'])

    @patch('backend.utils.db.get_db')
    @patch('backend.services.firebase_service.FirebaseService.send_emergency_multicast')
    def test_emergency_alert_successful_dispatch(self, mock_send, mock_db_getter):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_db_getter.return_value = mock_db
        mock_users.find_one.return_value = self.mock_user

        mock_send.return_value = {
            "success": True,
            "total_tokens": 3,
            "success_count": 3,
            "failure_count": 0,
            "invalid_tokens": [],
            "errors": []
        }

        response = self.client.post(
            '/api/emergency/alert',
            headers={'Authorization': f'Bearer {self.auth_token}'},
            json={
                "source": "gesture",
                "latitude": 12.9716,
                "longitude": 77.5946
            }
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['source'], 'gesture')
        self.assertIn("12.9716,77.5946", data['maps_url'])
        self.assertEqual(data['contacts_notified'], 2)

        # Verify multicast was called with structured data and collected tokens
        mock_send.assert_called_once()
        args, kwargs = mock_send.call_args
        tokens = kwargs.get('tokens') or args[0]
        self.assertIn("token_yash_phone", tokens)
        self.assertIn("token_yash_laptop", tokens)
        self.assertIn("token_doc_tablet", tokens)

        body = kwargs.get('body') or args[2]
        self.assertIn("HELP gesture detected for Aishwarya", body)

    @patch('backend.utils.db.get_db')
    def test_emergency_alert_no_registered_tokens(self, mock_db_getter):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_db_getter.return_value = mock_db

        user_without_tokens = dict(self.mock_user)
        user_without_tokens['emergency_contacts'] = [
            {"id": 1, "name": "Yash", "phone": "+91 9876543211", "relation": "Friend", "fcm_tokens": []}
        ]
        mock_users.find_one.return_value = user_without_tokens

        response = self.client.post(
            '/api/emergency/alert',
            headers={'Authorization': f'Bearer {self.auth_token}'},
            json={"source": "manual"}
        )

        self.assertEqual(response.status_code, 422)
        data = response.get_json()
        self.assertFalse(data['success'])
        self.assertIn("No registered device notification tokens found", data['message'])

    @patch('backend.utils.db.get_db')
    def test_invalid_token_cleanup_in_mongodb(self, mock_db_getter):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_db_getter.return_value = mock_db
        mock_users.find_one.return_value = self.mock_user

        # Remove "token_yash_phone"
        success = EmergencyService.remove_fcm_tokens(self.user_id, ["token_yash_phone"])
        self.assertTrue(success)

        mock_users.update_one.assert_called_once()
        update_args = mock_users.update_one.call_args[0]
        updated_contacts = update_args[1]["$set"]["emergency_contacts"]
        yash_tokens = updated_contacts[0]["fcm_tokens"]

        self.assertNotIn("token_yash_phone", yash_tokens)
        self.assertIn("token_yash_laptop", yash_tokens)


if __name__ == '__main__':
    unittest.main()
