"""Test-only guard: require an explicit target and matching frontend/CV projects."""
import re


def validate_target(cv_url, frontend_url, expected_ref):
    if not expected_ref or not re.fullmatch(r'[a-z0-9-]+', expected_ref):
        raise ValueError('Set LIVE_TEST_PROJECT_REF explicitly before running hosted writes.')
    expected = f'https://{expected_ref}.supabase.co'
    if cv_url.rstrip('/') != expected or frontend_url.rstrip('/') != expected:
        raise ValueError('CV, frontend and LIVE_TEST_PROJECT_REF must identify the same project.')
    return expected
