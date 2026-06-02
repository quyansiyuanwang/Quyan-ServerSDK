# OAuth Demo

Simple Node demo for the repository's **traditional OAuth 2.0** flow.

This demo shows:

- authorization code login
- PKCE (`S256`) support
- callback token exchange
- refresh token rotation
- calling `GET /users/me`
- revoke + logout

## What it integrates with

This demo targets the existing traditional OAuth implementation in the main project:

- authorization page: `/oauth/authorize`
- token endpoint: `/oauth/token`
- revoke endpoint: `/oauth/revoke`
- protected resource example: `GET /users/me`

It does **not** use `Auth Center`.

## Prerequisites

Before starting the demo, create an OAuth client in the main site and make sure:

1. the client is **approved**
2. the client includes the `profile` scope
3. the client `redirectUris` contains your demo callback exactly
4. you have the `client_id` and `client_secret`

Recommended callback for local development:

- `http://localhost:3200/oauth/callback`

## Configuration

Copy `.env.example` to `.env` and fill in the values:

- `PORT`: local port for the demo app
- `SESSION_SECRET`: long random string for the local demo session
- `OAUTH_BASE_URL`: OAuth API host, for example `http://localhost:10001` or `https://api.qysyw.cn`
- `OAUTH_AUTHORIZE_BASE_URL`: optional separate host for the consent page if it differs from the API host
- `OAUTH_CLIENT_ID`: approved OAuth client ID
- `OAUTH_CLIENT_SECRET`: approved OAuth client secret
- `OAUTH_REDIRECT_URI`: must exactly match the client whitelist entry
- `OAUTH_SCOPE`: space-separated scopes, default `profile`

## Run

From repo root:

1. install demo dependencies in `demos/oauth-demo`
2. start the demo with `pnpm run demo:oauth`
3. open `http://localhost:3200`

Or run directly inside `demos/oauth-demo` with:

- `pnpm run dev`
- `pnpm run start`

## Flow summary

1. Click **Start OAuth Login**
2. The demo creates `state` + PKCE `code_verifier`
3. The browser is redirected to the main site's `/oauth/authorize`
4. After approval, the main site redirects back to `/oauth/callback`
5. The demo exchanges the code at `/oauth/token`
6. The demo stores tokens in the server session
7. You can fetch `GET /users/me`, refresh the token, or revoke and logout

## Notes

- The server currently requires PKCE when the OAuth client has `isPkceRequired = true`; this demo always sends PKCE `S256`.
- `/oauth/token` returns RFC-style OAuth errors like `{ error, error_description }`, not the normal wrapped response format.
- Access tokens are opaque bearer tokens and should not be parsed client-side.

## Common failure cases

- `redirect_uri` does not exactly match the registered URI
- client is not approved yet
- client secret is wrong
- requested scope is not allowed for the client
- API host and authorize page host were configured incorrectly
