import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import session from 'express-session'
import axios from 'axios'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const config = {
  port: Number(process.env.PORT || 3200),
  sessionSecret: process.env.SESSION_SECRET || 'replace-me-in-env',
  oauthApiBaseUrl: requiredEnv('OAUTH_BASE_URL'),
  oauthAuthorizeBaseUrl: process.env.OAUTH_AUTHORIZE_BASE_URL || process.env.OAUTH_BASE_URL || '',
  clientId: requiredEnv('OAUTH_CLIENT_ID'),
  clientSecret: requiredEnv('OAUTH_CLIENT_SECRET'),
  redirectUri: requiredEnv('OAUTH_REDIRECT_URI'),
  scope: (process.env.OAUTH_SCOPE || 'profile').trim(),
}

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(
  session({
    name: 'oauth-demo.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
)

const oauthHttp = axios.create({
  baseURL: config.oauthApiBaseUrl,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
  },
})

app.get('/', async (req, res) => {
  const token = getTokenSession(req)
  let profileResult = null

  if (token?.accessToken) {
    profileResult = await fetchCurrentUser(token.accessToken).catch((error) => ({
      ok: false,
      status: error?.response?.status || 500,
      data: normalizeAxiosError(error),
    }))
  }

  res.type('html').send(
    renderPage({
      title: 'OAuth Demo',
      content: renderHome({
        config,
        token,
        profileResult,
        sessionState: getFlowState(req),
      }),
    }),
  )
})

app.get('/login', (req, res) => {
  const state = randomHex(16)
  const codeVerifier = base64Url(crypto.randomBytes(32))
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest())

  setFlowState(req, {
    state,
    codeVerifier,
    codeChallenge,
    startedAt: Date.now(),
  })

  const authorizeUrl = new URL('/oauth/authorize', ensureTrailingSlash(config.oauthAuthorizeBaseUrl))
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', config.clientId)
  authorizeUrl.searchParams.set('redirect_uri', config.redirectUri)
  authorizeUrl.searchParams.set('scope', config.scope)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  res.redirect(authorizeUrl.toString())
})

app.get('/oauth/callback', async (req, res) => {
  const flow = getFlowState(req)
  const error = stringValue(req.query.error)
  const errorDescription = stringValue(req.query.error_description)
  const code = stringValue(req.query.code)
  const state = stringValue(req.query.state)

  if (error) {
    clearFlowState(req)
    res.type('html').status(400).send(
      renderPage({
        title: 'OAuth callback error',
        content: renderErrorBlock('Authorization failed', {
          error,
          error_description: errorDescription || 'No description returned by the authorization server.',
        }),
      }),
    )
    return
  }

  if (!flow || !code || !state || state !== flow.state) {
    clearFlowState(req)
    res.type('html').status(400).send(
      renderPage({
        title: 'Invalid callback',
        content: renderErrorBlock('Invalid callback state', {
          expectedState: flow?.state || null,
          receivedState: state || null,
          code: code || null,
        }),
      }),
    )
    return
  }

  try {
    const tokenResponse = await exchangeAuthorizationCode({
      code,
      codeVerifier: flow.codeVerifier,
    })

    setTokenSession(req, {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || '',
      tokenType: tokenResponse.token_type,
      scope: tokenResponse.scope,
      expiresIn: tokenResponse.expires_in,
      receivedAt: Date.now(),
    })
    clearFlowState(req)
    res.redirect('/')
  } catch (exchangeError) {
    clearFlowState(req)
    res.type('html').status(400).send(
      renderPage({
        title: 'Token exchange failed',
        content: renderErrorBlock('Token exchange failed', normalizeAxiosError(exchangeError)),
      }),
    )
  }
})

app.post('/refresh', async (req, res) => {
  const token = getTokenSession(req)
  if (!token?.refreshToken) {
    res.redirect('/')
    return
  }

  try {
    const refreshed = await refreshAccessToken(token.refreshToken)
    setTokenSession(req, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || token.refreshToken,
      tokenType: refreshed.token_type,
      scope: refreshed.scope,
      expiresIn: refreshed.expires_in,
      receivedAt: Date.now(),
    })
    res.redirect('/')
  } catch (refreshError) {
    clearTokenSession(req)
    res.type('html').status(400).send(
      renderPage({
        title: 'Refresh failed',
        content: renderErrorBlock('Refresh token request failed', normalizeAxiosError(refreshError)),
      }),
    )
  }
})

app.post('/resource', async (req, res) => {
  const token = getTokenSession(req)
  if (!token?.accessToken) {
    res.redirect('/')
    return
  }

  try {
    const result = await fetchCurrentUser(token.accessToken)
    res.type('html').send(
      renderPage({
        title: 'Protected resource result',
        content: `
          <h1>Protected Resource Result</h1>
          <p><a href="/">Back to home</a></p>
          ${renderJsonCard('GET /users/me', result)}
        `,
      }),
    )
  } catch (resourceError) {
    res.type('html').status(400).send(
      renderPage({
        title: 'Resource request failed',
        content: `
          <h1>Protected Resource Failed</h1>
          <p><a href="/">Back to home</a></p>
          ${renderJsonCard('GET /users/me error', normalizeAxiosError(resourceError))}
        `,
      }),
    )
  }
})

app.post('/logout', async (req, res) => {
  const token = getTokenSession(req)
  const tokenToRevoke = token?.refreshToken || token?.accessToken
  const tokenTypeHint = token?.refreshToken ? 'refresh_token' : 'access_token'

  try {
    if (tokenToRevoke) {
      await revokeToken(tokenToRevoke, tokenTypeHint)
    }
  } catch {
    // best-effort revoke for demo
  }

  req.session.destroy(() => {
    res.redirect('/')
  })
})

app.use((error, _req, res, _next) => {
  res.status(500).type('html').send(
    renderPage({
      title: 'Unexpected server error',
      content: renderErrorBlock('Unexpected server error', normalizeAxiosError(error)),
    }),
  )
})

app.listen(config.port, () => {
  console.log(`OAuth demo listening on http://localhost:${config.port}`)
})

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`
}

function randomHex(size) {
  return crypto.randomBytes(size).toString('hex')
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function tokenBasicAuthHeader() {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  return `Basic ${credentials}`
}

async function exchangeAuthorizationCode({ code, codeVerifier }) {
  const { data } = await oauthHttp.post(
    '/oauth/token',
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

  if (data?.error) {
    const protocolError = new Error(data.error_description || data.error)
    protocolError.response = { data, status: 400 }
    throw protocolError
  }

  return data
}

async function refreshAccessToken(refreshToken) {
  const { data } = await oauthHttp.post(
    '/oauth/token',
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

  if (data?.error) {
    const protocolError = new Error(data.error_description || data.error)
    protocolError.response = { data, status: 400 }
    throw protocolError
  }

  return data
}

async function revokeToken(token, tokenTypeHint) {
  const { data } = await oauthHttp.post(
    '/oauth/revoke',
    {
      token,
      token_type_hint: tokenTypeHint,
    },
    {
      headers: {
        Authorization: tokenBasicAuthHeader(),
        'Content-Type': 'application/json',
      },
    },
  )

  return data
}

async function fetchCurrentUser(accessToken) {
  const { data, status } = await oauthHttp.get('/users/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return {
    ok: true,
    status,
    data,
  }
}

function getFlowState(req) {
  return req.session.oauthFlow || null
}

function setFlowState(req, value) {
  req.session.oauthFlow = value
}

function clearFlowState(req) {
  delete req.session.oauthFlow
}

function getTokenSession(req) {
  return req.session.oauthToken || null
}

function setTokenSession(req, value) {
  req.session.oauthToken = value
}

function clearTokenSession(req) {
  delete req.session.oauthToken
}

function normalizeAxiosError(error) {
  return {
    message: error?.message || 'Unknown error',
    status: error?.response?.status || null,
    data: error?.response?.data || null,
  }
}

function getExpiresInSeconds(token) {
  if (!token?.receivedAt || !token?.expiresIn) return null
  const expiresAt = token.receivedAt + token.expiresIn * 1000
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
}

function renderHome({ config, token, profileResult, sessionState }) {
  const expiresInSeconds = getExpiresInSeconds(token)

  return `
    <h1>Traditional OAuth 2.0 Demo</h1>
    <p>This sample integrates with the repository's existing OAuth server and authorization page.</p>

    <section class="card">
      <h2>Current configuration</h2>
      ${renderDefinitionList([
        ['OAuth API base URL', config.oauthApiBaseUrl],
        ['OAuth authorize base URL', config.oauthAuthorizeBaseUrl],
        ['Client ID', config.clientId],
        ['Redirect URI', config.redirectUri],
        ['Requested scope', config.scope],
      ])}
    </section>

    <section class="card">
      <h2>Login flow</h2>
      <p>This demo always sends PKCE <code>S256</code>, which matches the current server-side OAuth validation.</p>
      <form method="get" action="/login">
        <button type="submit">Start OAuth Login</button>
      </form>
      ${sessionState ? renderJsonCard('Pending PKCE/session state', sessionState) : '<p class="muted">No active authorization flow.</p>'}
    </section>

    <section class="grid">
      <div class="card">
        <h2>Token session</h2>
        ${token ? renderDefinitionList([
          ['Token type', token.tokenType],
          ['Access token', maskToken(token.accessToken)],
          ['Refresh token', maskToken(token.refreshToken)],
          ['Scope', token.scope],
          ['expires_in', `${token.expiresIn} seconds`],
          ['Local time remaining', expiresInSeconds == null ? 'Unknown' : `${expiresInSeconds} seconds`],
        ]) : '<p class="muted">Not logged in yet.</p>'}
        <div class="actions">
          <form method="post" action="/refresh"><button type="submit" ${token?.refreshToken ? '' : 'disabled'}>Refresh Token</button></form>
          <form method="post" action="/logout"><button type="submit" ${token ? '' : 'disabled'}>Logout + Revoke</button></form>
        </div>
      </div>

      <div class="card">
        <h2>Protected resource</h2>
        <p>Calls <code>GET /users/me</code> with <code>Authorization: Bearer oat_...</code>.</p>
        <form method="post" action="/resource">
          <button type="submit" ${token?.accessToken ? '' : 'disabled'}>Fetch Current User</button>
        </form>
        ${profileResult ? renderJsonCard('Latest /users/me result', profileResult) : '<p class="muted">No resource call yet.</p>'}
      </div>
    </section>
  `
}

function renderDefinitionList(items) {
  return `<dl class="def-list">${items
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value || ''))}</dd></div>`)
    .join('')}</dl>`
}

function renderJsonCard(title, value) {
  return `
    <div class="json-card">
      <h3>${escapeHtml(title)}</h3>
      <pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>
    </div>
  `
}

function renderErrorBlock(title, value) {
  return `
    <h1>${escapeHtml(title)}</h1>
    <p><a href="/">Back to home</a></p>
    ${renderJsonCard('Error details', value)}
  `
}

function maskToken(token) {
  if (!token) return ''
  if (token.length <= 18) return token
  return `${token.slice(0, 10)}…${token.slice(-6)}`
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderPage({ title, content }) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          :root { color-scheme: light dark; }
          body {
            font-family: Inter, Segoe UI, Arial, sans-serif;
            margin: 0;
            background: #0b1020;
            color: #e5eefc;
          }
          main {
            max-width: 1120px;
            margin: 0 auto;
            padding: 32px 20px 48px;
          }
          a { color: #8ec5ff; }
          h1, h2, h3 { margin-top: 0; }
          p { line-height: 1.6; }
          code {
            background: rgba(255,255,255,0.08);
            padding: 0.15rem 0.35rem;
            border-radius: 6px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 20px;
          }
          .card, .json-card {
            background: rgba(15, 23, 42, 0.92);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 18px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.35);
          }
          .muted {
            color: #98a5c0;
          }
          .def-list {
            display: grid;
            gap: 10px;
            margin: 0;
          }
          .def-list div {
            display: grid;
            gap: 4px;
          }
          .def-list dt {
            color: #8ea0c3;
            font-size: 0.92rem;
          }
          .def-list dd {
            margin: 0;
            word-break: break-all;
          }
          .actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-top: 16px;
          }
          button {
            appearance: none;
            border: 0;
            border-radius: 999px;
            padding: 12px 18px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            background: linear-gradient(135deg, #60a5fa, #2563eb);
            color: white;
          }
          button[disabled] {
            opacity: 0.45;
            cursor: not-allowed;
          }
          pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            overflow-x: auto;
            color: #d7e7ff;
          }
        </style>
      </head>
      <body>
        <main>${content}</main>
      </body>
    </html>
  `
}
