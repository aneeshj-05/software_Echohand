import unittest
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from bson import ObjectId
from datetime import datetime, timezone

from backend.app import create_app
from backend.utils.security import generate_token
from backend.services.firebase_service import FirebaseService, init_firebase, is_firebase_initialized
from backend.services.emergency_service import EmergencyService
from backend.utils.validators import validate_coordinates
from backend.utils.firebase_client_config import (
    validate_firebase_client_config,
    app_id_matches_sender_id,
)
from backend.utils.firebase_admin_config import (
    validate_firebase_admin_configuration,
    normalize_credentials_path,
    _repair_windows_path_after_dotenv,
    credentials_file_exists,
)


class TestNotificationConfigEndpoint(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def test_notification_config_returns_structure(self):
        response = self.client.get('/api/notifications/config')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['success'])
        self.assertIn('is_configured', data)
        self.assertIn('missing_fields', data)
        self.assertIn('config_issues', data)
        self.assertIn('config', data)
        cfg = data['config']
        for key in ('apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'vapidKey'):
            self.assertIn(key, cfg)

    @patch('backend.routes.emergency_routes.Config')
    def test_notification_config_valid_when_env_complete(self, mock_config):
        mock_config.FIREBASE_API_KEY = 'AIzaSyB0123456789012345678901234567890ab'
        mock_config.FIREBASE_PROJECT_ID = 'echohand-prod-123'
        mock_config.FIREBASE_AUTH_DOMAIN = 'echohand-prod-123.firebaseapp.com'
        mock_config.FIREBASE_STORAGE_BUCKET = 'echohand-prod-123.appspot.com'
        mock_config.FIREBASE_MESSAGING_SENDER_ID = '908070605040'
        mock_config.FIREBASE_APP_ID = '1:908070605040:web:abcdef0123456789abcd'
        mock_config.FIREBASE_VAPID_KEY = 'B' + ('x' * 86)
        mock_config.FIREBASE_ADMIN_PROJECT_ID = 'echohand-prod-123'

        response = self.client.get('/api/notifications/config')
        data = response.get_json()
        self.assertTrue(data['is_configured'])
        self.assertEqual(data['missing_fields'], [])
        self.assertEqual(data['admin_project_id'], 'echohand-prod-123')

    @patch('backend.routes.emergency_routes.Config')
    def test_notification_config_rejects_placeholders(self, mock_config):
        mock_config.FIREBASE_API_KEY = 'AIzaSy...'
        mock_config.FIREBASE_PROJECT_ID = 'echohand-emergency'
        mock_config.FIREBASE_AUTH_DOMAIN = 'echohand-emergency.firebaseapp.com'
        mock_config.FIREBASE_STORAGE_BUCKET = 'echohand-emergency.appspot.com'
        mock_config.FIREBASE_MESSAGING_SENDER_ID = 'your-messaging-sender-id'
        mock_config.FIREBASE_APP_ID = '1:908070605040:web:abcdef0123456789abcd'
        mock_config.FIREBASE_VAPID_KEY = 'your-vapid-key'
        mock_config.FIREBASE_ADMIN_PROJECT_ID = 'real-firebase-project'

        response = self.client.get('/api/notifications/config')
        data = response.get_json()
        self.assertFalse(data['is_configured'])
        self.assertIn('apiKey', data['missing_fields'])
        self.assertIn('projectId', data['missing_fields'])
        self.assertTrue(len(data['config_issues']) >= 1)


class TestFirebaseClientConfigValidation(unittest.TestCase):
    def test_app_id_matches_sender_id(self):
        self.assertTrue(app_id_matches_sender_id(
            '1:999888777666:web:abc123def4567890abcd',
            '999888777666'
        ))
        self.assertFalse(app_id_matches_sender_id(
            '1:111111111111:web:abc123def4567890abcd',
            '999888777666'
        ))

    def test_validate_rejects_documentation_placeholders(self):
        cfg = {
            'apiKey': '',
            'projectId': 'echohand-emergency',
            'messagingSenderId': '',
            'appId': '',
            'vapidKey': '',
        }
        ok, missing, issues = validate_firebase_client_config(cfg)
        self.assertFalse(ok)
        self.assertIn('apiKey', missing)
        self.assertIn('projectId', missing)


class TestWindowsCredentialsPathResolution(unittest.TestCase):
    def test_forward_slash_windows_path_resolves(self):
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as tmp:
            tmp.write('{"project_id":"test-proj"}')
            tmp_path = tmp.name

        try:
            forward = tmp_path.replace("\\", "/")
            resolved = normalize_credentials_path(forward)
            self.assertIsNotNone(resolved)
            self.assertTrue(resolved.is_file())
            self.assertTrue(credentials_file_exists(forward))
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_repair_dotenv_broken_users_segment(self):
        repaired = _repair_windows_path_after_dotenv("C:Users/aishw/Downloads/key.json")
        self.assertEqual(repaired, "C:\\Users\\aishw/Downloads/key.json")

    def test_repair_dotenv_bell_from_backslash_a(self):
        broken = "C:\\Users\\" + "\x07" + "ishw\\Downloads\\key.json"
        repaired = _repair_windows_path_after_dotenv(broken)
        self.assertIn("aishw", repaired)
        self.assertNotIn("\x07", repaired)


class TestFirebaseAdminConfiguration(unittest.TestCase):
    @patch('backend.utils.firebase_admin_config.resolve_service_account_path', return_value='')
    @patch('backend.utils.firebase_admin_config.Config.FIREBASE_PROJECT_ID', '')
    def test_missing_credentials_and_project_id_fails(self, *_mocks):
        ready, project_id, errors = validate_firebase_admin_configuration()
        self.assertFalse(ready)
        self.assertTrue(any('FIREBASE_CREDENTIALS_PATH' in e for e in errors))
        self.assertTrue(any('project ID is required' in e for e in errors))

    @patch('backend.utils.firebase_admin_config.read_firebase_admin_project_id', return_value='proj-from-sa')
    @patch('backend.utils.firebase_admin_config.Path.is_file', return_value=True)
    @patch('backend.utils.firebase_admin_config.resolve_service_account_path', return_value='/tmp/sa.json')
    @patch('backend.utils.firebase_admin_config.Config.FIREBASE_PROJECT_ID', 'proj-from-sa')
    def test_project_id_from_service_account(self, *_mocks):
        ready, project_id, errors = validate_firebase_admin_configuration()
        self.assertTrue(ready)
        self.assertEqual(project_id, 'proj-from-sa')
        self.assertEqual(errors, [])

    @patch('backend.utils.firebase_admin_config.read_firebase_admin_project_id', return_value='proj-a')
    @patch('backend.utils.firebase_admin_config.Path.is_file', return_value=True)
    @patch('backend.utils.firebase_admin_config.resolve_service_account_path', return_value='/tmp/sa.json')
    @patch('backend.utils.firebase_admin_config.Config.FIREBASE_PROJECT_ID', 'proj-b')
    def test_mismatched_project_ids_fail(self, *_mocks):
        ready, project_id, errors = validate_firebase_admin_configuration()
        self.assertFalse(ready)
        self.assertTrue(any('does not match' in e for e in errors))


class TestFirebaseInitialization(unittest.TestCase):
    @patch('backend.services.firebase_service.validate_firebase_admin_configuration', return_value=(True, 'echohand-test', []))
    @patch('backend.services.firebase_service.resolve_service_account_path', return_value='dummy_creds.json')
    @patch('backend.services.firebase_service.firebase_admin')
    @patch('backend.services.firebase_service.credentials.Certificate')
    def test_firebase_init_with_cert_and_project_id(self, mock_cert, mock_firebase_admin, *_mocks):
        mock_firebase_admin._apps = []
        mock_cred = MagicMock()
        mock_cert.return_value = mock_cred

        result = init_firebase()
        self.assertTrue(result)
        mock_cert.assert_called_with('dummy_creds.json')
        mock_firebase_admin.initialize_app.assert_called_once_with(
            mock_cred,
            {'projectId': 'echohand-test'},
        )

    @patch('backend.services.firebase_service.firebase_admin')
    def test_firebase_init_reuses_app_with_project_id(self, mock_firebase_admin):
        mock_app = MagicMock()
        mock_app.project_id = 'existing-proj'
        mock_firebase_admin._apps = ['default_app']
        mock_firebase_admin.get_app.return_value = mock_app

        result = init_firebase()
        self.assertTrue(result)
        mock_firebase_admin.initialize_app.assert_not_called()

    @patch('backend.services.firebase_service.validate_firebase_admin_configuration', return_value=(False, None, ['missing creds']))
    @patch('backend.services.firebase_service.firebase_admin')
    def test_firebase_init_fails_when_configuration_invalid(self, mock_firebase_admin, *_mocks):
        mock_firebase_admin._apps = []
        result = init_firebase()
        self.assertFalse(result)
        mock_firebase_admin.initialize_app.assert_not_called()

    @patch('backend.services.firebase_service.validate_firebase_admin_configuration', return_value=(True, 'proj-x', []))
    @patch('backend.services.firebase_service.resolve_service_account_path', return_value='dummy_creds.json')
    @patch('backend.services.firebase_service.firebase_admin')
    @patch('backend.services.firebase_service.credentials.Certificate')
    def test_firebase_reinits_when_existing_app_has_no_project(self, mock_cert, mock_firebase_admin, *_mocks):
        mock_app = MagicMock()
        mock_app.project_id = None
        mock_app.options = {}
        mock_firebase_admin._apps = ['default_app']
        mock_firebase_admin.get_app.return_value = mock_app
        mock_cred = MagicMock()
        mock_cert.return_value = mock_cred

        result = init_firebase()
        self.assertTrue(result)
        mock_firebase_admin.delete_app.assert_called_once()
        mock_firebase_admin.initialize_app.assert_called_once_with(
            mock_cred,
            {'projectId': 'proj-x'},
        )


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
        self.assertIn("Device registered successfully for Yash", data['message'])
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
    def test_emergency_alert_returns_200_when_fcm_succeeds(self, mock_send, mock_db_getter):
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
        self.assertIn("Emergency assistance is required", body)
        self.assertIn("12.9716,77.5946", body)

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
        self.assertIn("has not registered a notification device", data['message'])

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

    @patch('backend.utils.db.get_db')
    def test_register_duplicate_fcm_token_not_duplicated(self, mock_db_getter):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_db_getter.return_value = mock_db
        mock_users.find_one.return_value = self.mock_user

        token = 'duplicate_token_abc'
        first = EmergencyService.register_contact_token(self.user_id, token, 1)
        self.assertTrue(first['success'])
        update_count_after_first = mock_users.update_one.call_count

        second = EmergencyService.register_contact_token(self.user_id, token, 1)
        self.assertTrue(second['success'])
        self.assertIn('already active', second['message'].lower())
        self.assertEqual(mock_users.update_one.call_count, update_count_after_first)

    @patch('backend.utils.db.get_db')
    @patch('backend.services.firebase_service.FirebaseService.send_emergency_multicast')
    def test_emergency_alert_fcm_failure_returns_502(self, mock_send, mock_db_getter):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_db_getter.return_value = mock_db
        mock_users.find_one.return_value = self.mock_user

        mock_send.return_value = {
            "success": False,
            "error": "All multicast deliveries failed",
            "success_count": 0,
            "failure_count": 2,
            "invalid_tokens": [],
        }

        response = self.client.post(
            '/api/emergency/alert',
            headers={'Authorization': f'Bearer {self.auth_token}'},
            json={"source": "manual", "latitude": 12.0, "longitude": 77.0},
        )
        self.assertEqual(response.status_code, 502)
        data = response.get_json()
        self.assertFalse(data['success'])
        self.assertIn('Unable to deliver alert via Firebase', data['message'])

    @patch('backend.utils.db.get_db')
    @patch('backend.services.firebase_service.FirebaseService.send_emergency_multicast')
    def test_emergency_alert_maps_url_in_data_payload(self, mock_send, mock_db_getter):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_db_getter.return_value = mock_db
        mock_users.find_one.return_value = self.mock_user
        mock_send.return_value = {"success": True, "success_count": 1, "failure_count": 0, "invalid_tokens": []}

        self.client.post(
            '/api/emergency/alert',
            headers={'Authorization': f'Bearer {self.auth_token}'},
            json={"source": "manual", "latitude": 10.5, "longitude": 20.25},
        )

        kwargs = mock_send.call_args[1]
        data_payload = kwargs.get('data_payload') or {}
        self.assertIn('google.com/maps?q=10.5,20.25', data_payload.get('maps_url', ''))

    @patch('backend.services.firebase_service.FirebaseService.send_emergency_multicast')
    def test_registration_does_not_send_emergency_alert(self, mock_send):
        with patch('backend.utils.db.get_db') as mock_db_getter:
            mock_db = MagicMock()
            mock_users = MagicMock()
            mock_db.users = mock_users
            mock_db_getter.return_value = mock_db
            mock_users.find_one.return_value = self.mock_user

            EmergencyService.register_contact_token(self.user_id, 'new_only_token', 1)
            mock_send.assert_not_called()

    @patch('backend.utils.db.get_db')
    @patch('backend.services.emergency_service.FirebaseService.send_emergency_multicast')
    def test_emergency_alert_fcm_not_configured_returns_503(self, mock_send, mock_db_getter):
        mock_db = MagicMock()
        mock_users = MagicMock()
        mock_db.users = mock_users
        mock_db_getter.return_value = mock_db
        mock_users.find_one.return_value = self.mock_user

        mock_send.return_value = {
            "success": False,
            "error": "Firebase Admin SDK is not configured for FCM.",
            "success_count": 0,
            "failure_count": 1,
            "invalid_tokens": [],
        }

        response = self.client.post(
            '/api/emergency/alert',
            headers={'Authorization': f'Bearer {self.auth_token}'},
            json={"source": "manual", "latitude": 12.0, "longitude": 77.0},
        )
        self.assertEqual(response.status_code, 503)
        data = response.get_json()
        self.assertFalse(data['success'])

    def test_emergency_ui_primary_flow_has_no_whatsapp_backup_link(self):
        emergency_js = (Path(__file__).resolve().parent.parent / 'frontend' / 'js' / 'emergency.js').read_text(
            encoding='utf-8'
        )
        self.assertNotIn('WhatsApp Backup', emergency_js)
        self.assertIn('Optional backup', emergency_js)


if __name__ == '__main__':
    unittest.main()
