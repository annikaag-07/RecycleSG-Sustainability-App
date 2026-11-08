import unittest
from unittest.mock import Mock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
import app
from verification import verify_activity, SupabaseGateway


class VerificationTests(unittest.TestCase):
    def gateway(self):
        gateway = Mock()
        gateway.user.return_value = {'id': 'owner'}
        gateway.activity.return_value = {'id': 1, 'user_id': 'owner', 'verification_status': 'Pending',
                                         'photo_url': 'owner/photo.png', 'material_type_id': 1, 'quantity': 3}
        gateway.photo.return_value = (b'image', 'image/png')
        gateway.material.return_value = 'Plastic'
        gateway.finalize.side_effect = lambda a, status, result: {
            **a, 'verification_status': status, 'cv_predicted_material': result['material'], 'cv_confidence': result['confidence']}
        return gateway

    def test_matching_material_finalizes(self):
        gateway = self.gateway()
        result = verify_activity(1, 'token', gateway, lambda *args: {'status': 'ok', 'material': 'plastic', 'confidence': .9})
        self.assertEqual(result['status'], 'Verified')
        gateway.user.assert_called_once_with('token')
        gateway.activity.assert_called_once_with(1, 'owner')

    def test_impact_only_counts_persisted_verified_quantity(self):
        for status, expected in [('Verified', .3), ('Rejected', 0), ('Pending', 0)]:
            gateway = self.gateway()
            gateway.activity.return_value['verification_status'] = status
            result = verify_activity(1, 'token', gateway, lambda *args: {'status': 'unsure'})
            self.assertEqual(result['activity_impact']['estimated_co2_saved_kg'], expected)
            self.assertEqual(result['activity_impact']['basis'], 'illustrative_per_item_v1')
            self.assertTrue(result['activity_impact']['is_estimate'])

    def test_competing_finalizer_result_controls_impact(self):
        gateway = self.gateway()
        gateway.finalize.side_effect = lambda a, *args: {**a, 'verification_status': 'Rejected'}
        result = verify_activity(1, 'token', gateway, lambda *args: {'status': 'ok', 'material': 'plastic', 'confidence': .9})
        self.assertEqual(result['activity_impact']['estimated_co2_saved_kg'], 0)

    def test_mismatch_rejects(self):
        result = verify_activity(1, 'token', self.gateway(), lambda *args: {'status': 'ok', 'material': 'glass', 'confidence': .9})
        self.assertEqual(result['status'], 'Rejected')

    def test_uncertain_and_unavailable_remain_pending(self):
        for status in ['unsure', 'unavailable']:
            gateway = self.gateway()
            result = verify_activity(1, 'token', gateway, lambda *args: {'status': status})
            self.assertEqual(result['status'], 'Pending')
            gateway.finalize.assert_not_called()

    def test_terminal_retry_skips_model_and_finalization(self):
        for status in ['Verified', 'Rejected']:
            gateway = self.gateway()
            gateway.activity.return_value['verification_status'] = status
            model = Mock()
            self.assertEqual(verify_activity(1, 'token', gateway, model)['status'], status)
            model.assert_not_called()
            gateway.finalize.assert_not_called()

    def test_wrong_owner_is_hidden(self):
        gateway = self.gateway()
        gateway.activity.return_value['user_id'] = 'other'
        with self.assertRaises(HTTPException) as error:
            verify_activity(1, 'token', gateway)
        self.assertEqual(error.exception.status_code, 404)
        gateway.photo.assert_not_called()

    def test_missing_foreign_and_traversal_photo_paths(self):
        for path in [None, 'other/photo.png', 'owner/../photo.png']:
            gateway = self.gateway()
            gateway.activity.return_value['photo_url'] = path
            with self.assertRaises(HTTPException) as error:
                verify_activity(1, 'token', gateway)
            self.assertEqual(error.exception.status_code, 422)
            gateway.photo.assert_not_called()

    def test_empty_or_unsupported_photo_never_calls_model(self):
        for data, mime in [(b'', 'image/png'), (b'html', 'text/html')]:
            gateway = self.gateway()
            gateway.photo.return_value = (data, mime)
            model = Mock()
            with self.assertRaises(HTTPException):
                verify_activity(1, 'token', gateway, model)
            model.assert_not_called()

    def test_http_requires_bearer_and_positive_id(self):
        client = TestClient(app.app)
        self.assertEqual(client.post('/verify', json={'activity_id': 1}).status_code, 401)
        self.assertEqual(client.post('/verify', json={'activity_id': 0}, headers={'Authorization': 'Bearer token'}).status_code, 422)

    def test_configuration_errors_do_not_expose_keys(self):
        with patch.dict('os.environ', {'SUPABASE_URL': '', 'SUPABASE_SERVICE_ROLE_KEY': ''}):
            with self.assertRaises(HTTPException) as error:
                SupabaseGateway()
        self.assertEqual(error.exception.status_code, 503)

    def test_paper_cardboard_metal_remain_distinct(self):
        from classifier import GeminiResult, MATERIALS
        for material in ['paper', 'cardboard', 'metal']:
            self.assertIn(material, MATERIALS)
            self.assertEqual(GeminiResult(material=material, confidence=.9, reason='test').material, material)
