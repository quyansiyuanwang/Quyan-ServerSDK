import base64
import hashlib
import os
import secrets
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()


def required_env(name: str) -> str:
    value = os.getenv(name, '').strip()
    if not value:
        raise RuntimeError(f'Missing required environment variable: {name}')
    return value


OAUTH_BASE_URL = required_env('OAUTH_BASE_URL')
OAUTH_CLIENT_ID = required_env('OAUTH_CLIENT_ID')
OAUTH_CLIENT_SECRET = required_env('OAUTH_CLIENT_SECRET')
OAUTH_REDIRECT_URI = required_env('OAUTH_REDIRECT_URI')
OAUTH_SCOPE = os.getenv('OAUTH_SCOPE', 'profile').strip()


def create_pkce_pair() -> tuple[str, str]:
    code_verifier = base64_url(secrets.token_bytes(32))
    code_challenge = base64_url(hashlib.sha256(code_verifier.encode('utf-8')).digest())
    return code_verifier, code_challenge


def create_authorize_url(state: str, code_challenge: str) -> str:
    return (
        f"{OAUTH_BASE_URL.rstrip('/')}/v1/oauth/authorize"
        f"?response_type=code"
        f"&client_id={OAUTH_CLIENT_ID}"
        f"&redirect_uri={OAUTH_REDIRECT_URI}"
        f"&scope={OAUTH_SCOPE}"
        f"&state={state}"
        f"&code_challenge={code_challenge}"
        f"&code_challenge_method=S256"
    )


def exchange_authorization_code(code: str, code_verifier: str) -> dict[str, Any]:
    response = requests.post(
        f"{OAUTH_BASE_URL.rstrip('/')}/v1/oauth/token",
        json={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': OAUTH_REDIRECT_URI,
            'code_verifier': code_verifier,
        },
        headers=token_headers(),
        timeout=15,
    )
    return unwrap_oauth_response(response)


def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    response = requests.post(
        f"{OAUTH_BASE_URL.rstrip('/')}/v1/oauth/token",
        json={
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token,
        },
        headers=token_headers(),
        timeout=15,
    )
    return unwrap_oauth_response(response)


def fetch_current_user(access_token: str) -> dict[str, Any]:
    response = requests.get(
        f"{OAUTH_BASE_URL.rstrip('/')}/v1/users/me",
        headers={
            'Accept': 'application/json',
            'Authorization': f'Bearer {access_token}',
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def token_headers() -> dict[str, str]:
    basic = base64.b64encode(f'{OAUTH_CLIENT_ID}:{OAUTH_CLIENT_SECRET}'.encode('utf-8')).decode('utf-8')
    return {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': f'Basic {basic}',
    }


def unwrap_oauth_response(response: requests.Response) -> dict[str, Any]:
    payload = response.json()
    if 'error' in payload:
        raise RuntimeError(payload.get('error_description') or payload['error'])
    response.raise_for_status()
    return payload


def base64_url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')


if __name__ == '__main__':
    state = secrets.token_urlsafe(24)
    code_verifier, code_challenge = create_pkce_pair()
    print('Python OAuth SDK sample ready.')
    print('Authorize URL:')
    print(create_authorize_url(state, code_challenge))
    print('')
    print('Persist this PKCE verifier until your callback receives the code:')
    print(code_verifier)
    print('')
    print('Then call exchange_authorization_code(code, code_verifier) in your callback handler.')
