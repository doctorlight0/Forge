import { describe, expect, it } from 'vitest'
import { filterRpcDirectory } from './rpcDirectoryUtils'

const items = [
  { id: 'a', name: 'NEAR Testnet RPC', type: 'rpc' as const, url: 'https://rpc.testnet.near.org', purpose: 'Canonical JSON-RPC', auth: 'None', rateLimit: 'Shared', archival: 'no', checkable: true },
  { id: 'b', name: 'NearBlocks API', type: 'indexer' as const, url: 'https://api-testnet.nearblocks.io/v3', purpose: 'Indexed txns', auth: 'Optional key', rateLimit: '429 possible', archival: 'plan-dependent', notes: 'Rate limited', checkable: false },
  { id: 'c', name: 'NEAR CLI', type: 'tool' as const, url: 'https://github.com/near/near-cli-rs', purpose: 'Command line', auth: 'Local keychain', rateLimit: 'N/A', archival: 'not-applicable', checkable: false },
]

describe('RPC directory filtering', () => {
  it('returns all items with no filters', () => {
    expect(filterRpcDirectory(items, '', 'all')).toHaveLength(3)
  })

  it('filters by provider type', () => {
    expect(filterRpcDirectory(items, '', 'rpc').map((i) => i.id)).toEqual(['a'])
    expect(filterRpcDirectory(items, '', 'indexer')).toHaveLength(1)
  })

  it('searches across name, url, purpose, auth, notes, and metadata', () => {
    expect(filterRpcDirectory(items, 'json-rpc', 'all').map((i) => i.id)).toEqual(['a'])
    expect(filterRpcDirectory(items, 'nearblocks.io', 'all').map((i) => i.id)).toEqual(['b'])
    expect(filterRpcDirectory(items, 'rate limited', 'all').map((i) => i.id)).toEqual(['b'])
    expect(filterRpcDirectory(items, 'CLI-RS', 'all').map((i) => i.id)).toEqual(['c'])
  })

  it('combines search and type filter', () => {
    expect(filterRpcDirectory(items, 'near', 'tool').map((i) => i.id)).toEqual(['c'])
    expect(filterRpcDirectory(items, 'near', 'rpc').map((i) => i.id)).toEqual(['a'])
  })

  it('returns empty state when nothing matches', () => {
    expect(filterRpcDirectory(items, 'zzzz-nope', 'all')).toEqual([])
  })
})
