import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }))
app.use(express.json())

// Provider configuration (documented; no invented capabilities)
const providers = {
  mainnet: {
    rpcs: [
      { name: 'NEAR Official', url: 'https://rpc.mainnet.near.org' },
      { name: 'FASTNEAR', url: 'https://free.rpc.fastnear.com' },
    ],
    indexer: 'https://api.nearblocks.io/v1',
    explorer: 'https://nearblocks.io',
  },
  testnet: {
    rpcs: [
      { name: 'NEAR Official', url: 'https://rpc.testnet.near.org' },
      { name: 'FASTNEAR', url: 'https://test.rpc.fastnear.com' },
    ],
    indexer: 'https://api-testnet.nearblocks.io/v1',
    explorer: 'https://testnet.nearblocks.io',
  },
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'near-forge-backend' }))
app.get('/api/providers', (req, res) => {
  const network = req.query.network
  if (network === 'mainnet' || network === 'testnet') return res.json(providers[network])
  res.json(providers)
})

// Simple JSON-RPC connectivity check (proxy-safe server-side check)
app.post('/api/check-endpoint', async (req, res) => {
  const { url } = req.body || {}
  if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) return res.status(400).json({ ok: false, error: 'invalid url' })
  const start = Date.now()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'check', method: 'block', params: { finality: 'final' } }), signal: ctrl.signal })
    const latencyMs = Date.now() - start
    if (!r.ok) return res.json({ ok: false, latencyMs, error: `HTTP ${r.status}` })
    const j = await r.json()
    if (j.error) return res.json({ ok: false, latencyMs, error: j.error.message || 'rpc error' })
    return res.json({ ok: true, latencyMs, blockHeight: j.result?.header?.height })
  } catch (e) {
    return res.json({ ok: false, latencyMs: Date.now() - start, error: e.message || 'request failed' })
  } finally { clearTimeout(t) }
})

// Optional indexer proxy (adds API key server-side if configured) - best effort
app.get('/api/indexer/:network/account/:accountId/txns', async (req, res) => {
  const { network, accountId } = req.params
  if (!['mainnet','testnet'].includes(network)) return res.status(400).json({ error: 'invalid network' })
  const base = network === 'mainnet' ? 'https://api.nearblocks.io/v1' : 'https://api-testnet.nearblocks.io/v1'
  const page = req.query.page || '1'
  const perPage = req.query.per_page || '25'
  try {
    const headers = { Accept: 'application/json' }
    const key = network === 'mainnet' ? process.env.NEARBLOCKS_API_KEY_MAINNET : process.env.NEARBLOCKS_API_KEY_TESTNET
    if (key) headers.Authorization = `Bearer ${key}`
    const r = await fetch(`${base}/account/${encodeURIComponent(accountId)}/txns?page=${page}&per_page=${perPage}&order=desc`, { headers })
    const text = await r.text()
    res.status(r.status).type('application/json').send(text)
  } catch (e) { res.status(502).json({ error: e.message }) }
})

// Basic input validation example endpoint
app.get('/api/validate-account', (req, res) => {
  const id = String(req.query.accountId || '').trim().toLowerCase()
  const isImplicit = /^[0-9a-f]{64}$/.test(id)
  const isNamed = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(id)
  res.json({ accountId: id, valid: isImplicit || isNamed, type: isImplicit ? 'implicit' : isNamed ? 'named' : 'invalid' })
})

const port = Number(process.env.PORT || 8787)
app.listen(port, () => console.log(`near-forge backend listening on ${port}`))
