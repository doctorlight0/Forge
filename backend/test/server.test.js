import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { createApp, normalizeAccountId } from '../src/server.js'

let server
let base

before(async () => {
  process.env.NODE_ENV = 'test'
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise((resolve) => server.close(resolve)))

describe('account validation', () => {
  test('supports named and implicit Testnet account shapes', () => {
    assert.deepEqual(normalizeAccountId(' Alice.Testnet '), { accountId: 'alice.testnet', valid: true, type: 'named' })
    assert.equal(normalizeAccountId('a'.repeat(64)).type, 'implicit')
    assert.equal(normalizeAccountId('bad account').valid, false)
  })
})

describe('API routes', () => {
  test('health and providers identify Testnet only', async () => {
    const health = await fetch(`${base}/api/health`).then((response) => response.json())
    const providers = await fetch(`${base}/api/providers`).then((response) => response.json())
    assert.equal(health.data.network, 'testnet')
    assert.equal(providers.data.network, 'testnet')
    assert.equal(JSON.stringify(providers).includes('mainnet'), false)
  })

  test('rejects arbitrary endpoint checks to prevent SSRF', async () => {
    const response = await fetch(`${base}/api/check-endpoint`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'http://127.0.0.1:1' }) })
    const payload = await response.json()
    assert.equal(response.status, 400)
    assert.equal(payload.error.code, 'ENDPOINT_NOT_ALLOWED')
  })

  test('validates account and pagination before contacting indexers', async () => {
    const invalidAccount = await fetch(`${base}/api/indexer/account/not%20valid/txns`)
    const invalidPage = await fetch(`${base}/api/indexer/account/alice.testnet/txns?limit=0`)
    const invalidCursor = await fetch(`${base}/api/indexer/account/alice.testnet/txns?next=not%20opaque`)
    assert.equal(invalidAccount.status, 400)
    assert.equal(invalidPage.status, 400)
    assert.equal(invalidCursor.status, 400)
  })

  test('returns a consistent 404 envelope', async () => {
    const response = await fetch(`${base}/missing`)
    const payload = await response.json()
    assert.equal(response.status, 404)
    assert.deepEqual(payload, { ok: false, error: { code: 'NOT_FOUND', message: 'API route not found.' } })
  })
})
