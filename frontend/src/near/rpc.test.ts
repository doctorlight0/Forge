import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkEndpoint, viewAccount } from './rpc'

afterEach(() => vi.unstubAllGlobals())

describe('Testnet RPC client', () => {
  it('always targets the configured Testnet RPC', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { amount: '1' } }) })
    vi.stubGlobal('fetch', fetchMock)
    await viewAccount('alice.testnet')
    expect(fetchMock.mock.calls[0][0]).toBe('https://rpc.testnet.near.org')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).params.account_id).toBe('alice.testnet')
  })

  it('reports connectivity failures instead of inventing status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(checkEndpoint('https://rpc.testnet.near.org')).resolves.toMatchObject({ ok: false, error: 'HTTP 503' })
  })
})
