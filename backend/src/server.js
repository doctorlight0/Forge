import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

dotenv.config()

export const TESTNET_PROVIDERS = {
  network: 'testnet',
  rpcs: [
    { name: 'NEAR Testnet RPC', url: 'https://rpc.testnet.near.org', archival: false },
    { name: 'FASTNEAR Testnet RPC', url: 'https://test.rpc.fastnear.com', archival: 'provider-dependent' },
  ],
  indexer: 'https://api-testnet.nearblocks.io/v3',
  explorer: 'https://testnet.nearblocks.io',
  faucetDocs: 'https://docs.near.org/tools/faucet',
}

const ACCOUNT_PATTERN = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
const IMPLICIT_PATTERN = /^[0-9a-f]{64}$/

export function normalizeAccountId(value) {
  const accountId = String(value || '').trim().toLowerCase()
  const validLength = accountId.length >= 2 && accountId.length <= 64
  return { accountId, valid: validLength && (IMPLICIT_PATTERN.test(accountId) || ACCOUNT_PATTERN.test(accountId)), type: IMPLICIT_PATTERN.test(accountId) ? 'implicit' : ACCOUNT_PATTERN.test(accountId) ? 'named' : 'invalid' }
}

function allowedOrigins() {
  const configured = String(process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean)
  return new Set(configured)
}

function error(res, status, code, message, details) {
  return res.status(status).json({ ok: false, error: { code, message, ...(details ? { details } : {}) } })
}

function buildAllowedRpcUrls() {
  const urls = TESTNET_PROVIDERS.rpcs.map((provider) => provider.url)
  const additional = String(process.env.RPC_CHECK_ALLOWLIST || '').split(',').map((value) => value.trim()).filter(Boolean)
  return new Set([...urls, ...additional].map((value) => value.replace(/\/$/, '')))
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetch(url, { ...options, signal: controller.signal }) }
  finally { clearTimeout(timeout) }
}

export function createApp() {
  const app = express()
  const origins = allowedOrigins()
  const allowedRpcUrls = buildAllowedRpcUrls()
  const rate = new Map()

  app.disable('x-powered-by')
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origins.has(origin)) return callback(null, true)
      return callback(new Error('Origin is not allowed by CORS'))
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  }))
  app.use(express.json({ limit: '32kb' }))
  app.use((req, res, next) => {
    const key = req.ip || 'unknown'
    const now = Date.now()
    const current = rate.get(key)
    if (!current || current.resetAt <= now) rate.set(key, { count: 1, resetAt: now + 60_000 })
    else {
      current.count += 1
      if (current.count > 120) return error(res, 429, 'RATE_LIMITED', 'Too many API requests. Retry after one minute.')
    }
    next()
  })
  app.use((req, res, next) => {
    const started = Date.now()
    res.on('finish', () => {
      if (process.env.NODE_ENV !== 'test') console.info(JSON.stringify({ method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started }))
    })
    next()
  })

  app.get('/api/health', (_req, res) => res.json({ ok: true, data: { service: 'forge-backend', network: 'testnet', timestamp: new Date().toISOString() } }))
  app.get('/api/providers', (_req, res) => res.json({ ok: true, data: TESTNET_PROVIDERS }))
  app.get('/api/validate-account', (req, res) => res.json({ ok: true, data: normalizeAccountId(req.query.accountId) }))

  app.post('/api/check-endpoint', async (req, res) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.replace(/\/$/, '') : ''
    if (!allowedRpcUrls.has(url)) return error(res, 400, 'ENDPOINT_NOT_ALLOWED', 'Endpoint must be a configured NEAR Testnet RPC.')
    const started = Date.now()
    try {
      const response = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'forge-check', method: 'block', params: { finality: 'final' } }) })
      const latencyMs = Date.now() - started
      if (!response.ok) return error(res, 502, 'PROVIDER_HTTP_ERROR', `RPC returned HTTP ${response.status}`, { latencyMs })
      const payload = await response.json()
      if (payload.error) return error(res, 502, 'PROVIDER_RPC_ERROR', payload.error.message || 'RPC returned an error', { latencyMs })
      return res.json({ ok: true, data: { reachable: true, latencyMs, blockHeight: payload.result?.header?.height ?? null, checkedAt: new Date().toISOString() } })
    } catch (reason) {
      return error(res, 502, 'PROVIDER_UNAVAILABLE', reason?.name === 'AbortError' ? 'RPC check timed out.' : 'RPC check failed.', { latencyMs: Date.now() - started })
    }
  })

  app.get('/api/indexer/account/:accountId/txns', async (req, res) => {
    const account = normalizeAccountId(req.params.accountId)
    if (!account.valid) return error(res, 400, 'INVALID_ACCOUNT', 'A valid named or implicit Testnet account is required.')
    const limit = Number(req.query.limit || 25)
    const cursor = typeof req.query.next === 'string' ? req.query.next : ''
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || cursor.length > 2048 || (cursor && !/^[A-Za-z0-9+/=_-]+$/.test(cursor))) return error(res, 400, 'INVALID_PAGINATION', 'limit must be 1-50 and next must be a valid opaque cursor.')
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('next', cursor)
    const url = `${TESTNET_PROVIDERS.indexer}/accounts/${encodeURIComponent(account.accountId)}/txns?${params}`
    try {
      const headers = { Accept: 'application/json' }
      if (process.env.NEARBLOCKS_API_KEY_TESTNET) headers.Authorization = `Bearer ${process.env.NEARBLOCKS_API_KEY_TESTNET}`
      const response = await fetchWithTimeout(url, { headers })
      const payload = await response.text()
      res.set('Cache-Control', 'private, max-age=10')
      if (!response.ok) return error(res, response.status === 429 ? 429 : 502, response.status === 429 ? 'INDEXER_RATE_LIMITED' : 'INDEXER_ERROR', response.status === 429 ? 'NearBlocks rate limit reached.' : `NearBlocks returned HTTP ${response.status}`)
      try { return res.json(JSON.parse(payload)) }
      catch { return error(res, 502, 'INVALID_PROVIDER_RESPONSE', 'Indexer returned invalid JSON.') }
    } catch (reason) {
      return error(res, 502, 'INDEXER_UNAVAILABLE', reason?.name === 'AbortError' ? 'Indexer request timed out.' : 'Indexer request failed.')
    }
  })

  app.use((_req, res) => error(res, 404, 'NOT_FOUND', 'API route not found.'))
  app.use((reason, _req, res, _next) => {
    if (reason?.message === 'Origin is not allowed by CORS') return error(res, 403, 'CORS_DENIED', reason.message)
    if (reason?.type === 'entity.parse.failed') return error(res, 400, 'INVALID_JSON', 'Request body must contain valid JSON.')
    return error(res, 500, 'INTERNAL_ERROR', 'Unexpected server error.')
  })
  return app
}

export function startServer(port = Number(process.env.PORT || 8787)) {
  const server = createApp().listen(port, () => console.info(`Forge NEAR Testnet backend listening on ${port}`))
  return server
}

const entry = process.argv[1] ? fileURLToPath(new URL(`file://${process.argv[1]}`)) : ''
if (entry && fileURLToPath(import.meta.url) === entry) startServer()
