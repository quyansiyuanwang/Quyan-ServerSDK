import crypto from 'node:crypto'
import dotenv from 'dotenv'
import axios from 'axios'

dotenv.config()

const config = {
  oauthBaseUrl: requiredEnv('OAUTH_BASE_URL'),
  clientId: requiredEnv('OAUTH_CLIENT_ID'),
  clientSecret: requiredEnv('OAUTH_CLIENT_SECRET'),
  redirectUri: requiredEnv('OAUTH_REDIRECT_URI'),
  scope: (process.env.OAUTH_SCOPE || 'profile').trim(),
}

const oauthHttp = axios.create({
  baseURL: config.oauthBaseUrl,
  timeout: 15000,
  headers: { Accept: 'application/json' },
})

export function createPkcePair() {
  const codeVerifier = base64Url(crypto.randomBytes(32))
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest())
  return { codeVerifier, codeChallenge }
}

export function createAuthorizeUrl({ state, codeChallenge }) {
  const url = new URL('/v1/oauth/authorize', ensureTrailingSlash(config.oauthBaseUrl))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export async function exchangeAuthorizationCode({ code, codeVerifier }) {
  const { data } = await oauthHttp.post(
    '/v1/oauth/token',
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    },
    {
      headers: {
        Authorization: tokenBasicAuthHeader(),
        'Content-Type': 'application/json',
      },
    },
  )

  return unwrapOAuthTokenResponse(data)
}

export async function refreshAccessToken(refreshToken) {
  const { data } = await oauthHttp.post(
    '/v1/oauth/token',
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    {
      headers: {
        Authorization: tokenBasicAuthHeader(),
        'Content-Type': 'application/json',
      },
    },
  )

  return unwrapOAuthTokenResponse(data)
}

export async function fetchCurrentUser(accessToken) {
  const { data } = await oauthHttp.get('/v1/users/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return data
}

function unwrapOAuthTokenResponse(data) {
  if (data?.error) {
    const error = new Error(data.error_description || data.error)
    error.oauth = data
    throw error
  }

  return data
}

function tokenBasicAuthHeader() {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  return `Basic ${credentials}`
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const state = crypto.randomUUID()
  const { codeVerifier, codeChallenge } = createPkcePair()
  const authorizeUrl = createAuthorizeUrl({ state, codeChallenge })

  console.log('Node OAuth SDK sample ready.')
  console.log('Authorize URL:')
  console.log(authorizeUrl)
  console.log('')
  console.log('Persist this PKCE verifier until your callback receives the code:')
  console.log(codeVerifier)
  console.log('')
  console.log('Then call exchangeAuthorizationCode({ code, codeVerifier }) in your own server callback.')
}
