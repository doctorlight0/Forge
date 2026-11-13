import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAccountTxns, getFtTokens, getNftTokens, getStakingPools, getTxnDetail } from './indexer'

afterEach(() => vi.unstubAllGlobals())

function respond(payload: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => payload })
}

describe('NearBlocks v3 client', () => {
  it('uses cursor pagination and unwraps the v3 envelope', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL) => respond({ data: [{ transaction_hash: 'tx' }], meta: { next_page: 'next-cursor', prev_page: null } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await getAccountTxns('alice.testnet', 'current-cursor', 25)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v3/accounts/alice.testnet/txns?limit=25&next=current-cursor')
    expect(result.data).toEqual({ txns: [{ transaction_hash: 'tx' }], nextPage: 'next-cursor', prevPage: null })
  })

  it('uses the documented v3 asset, staking, and transaction paths', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL) => respond(null))
      .mockImplementationOnce((_input) => respond({ data: [{ contract: 'token.testnet' }] }))
      .mockImplementationOnce((_input) => respond({ data: [{ contract: 'nft.testnet' }] }))
      .mockImplementationOnce((_input) => respond([{ validator_id: 'pool.testnet', deposit: '1' }]))
      .mockImplementationOnce((_input) => respond({ data: { transaction_hash: 'hash' } }))
    vi.stubGlobal('fetch', fetchMock)
    await getFtTokens('alice.testnet')
    await getNftTokens('alice.testnet')
    await getStakingPools('alice.testnet')
    const detail = await getTxnDetail('hash')
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls[0]).toContain('/v3/accounts/alice.testnet/assets/fts')
    expect(urls[1]).toContain('/v3/accounts/alice.testnet/assets/nfts')
    expect(urls[2]).toContain('/v3/kitwallet/staking-deposits/alice.testnet')
    expect(urls[3]).toContain('/v3/txns/hash')
    expect(detail.data).toEqual({ transaction_hash: 'hash' })
  })
})
