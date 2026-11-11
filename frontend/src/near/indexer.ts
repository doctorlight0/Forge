import { NETWORKS, type NetworkId } from '../config'

export type IndexerResult<T> = { data: T | null; error?: string; source?: string }

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (res.status === 429) throw new Error('Rate limited by indexer (429)')
  if (!res.ok) throw new Error(`Indexer HTTP ${res.status}`)
  return res.json()
}

function base(network: NetworkId) {
  return NETWORKS[network].indexerBaseUrl
}

/** NearBlocks-compatible documented API (public). Requires no key for basic usage but may rate-limit. */
export async function getAccountTxns(network: NetworkId, accountId: string, page = 1, perPage = 25): Promise<IndexerResult<{ txns: any[]; cursor?: any }>> {
  const b = base(network)
  if (!b) return { data: null, error: 'No indexer configured for this network' }
  try {
    // NearBlocks: /v1/account/{account}/txns
    const json = await fetchJson(`${b}/account/${encodeURIComponent(accountId)}/txns?page=${page}&per_page=${perPage}&order=desc`)
    const txns = json?.txns ?? json?.data ?? []
    return { data: { txns, cursor: json?.cursor }, source: 'NearBlocks API' }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Indexer request failed', source: 'NearBlocks API' }
  }
}

export async function getFtTokens(network: NetworkId, accountId: string): Promise<IndexerResult<any[]>> {
  const b = base(network)
  if (!b) return { data: null, error: 'No indexer configured for this network' }
  try {
    const json = await fetchJson(`${b}/account/${encodeURIComponent(accountId)}/ft-tokens`)
    return { data: json?.tokens ?? json?.inventory ?? json ?? [], source: 'NearBlocks API' }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Indexer request failed', source: 'NearBlocks API' }
  }
}

export async function getNftTokens(network: NetworkId, accountId: string): Promise<IndexerResult<any[]>> {
  const b = base(network)
  if (!b) return { data: null, error: 'No indexer configured for this network' }
  try {
    const json = await fetchJson(`${b}/account/${encodeURIComponent(accountId)}/nft-tokens`)
    return { data: json?.tokens ?? json?.inventory ?? json ?? [], source: 'NearBlocks API' }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Indexer request failed', source: 'NearBlocks API' }
  }
}

export async function getStakingPools(network: NetworkId, accountId: string): Promise<IndexerResult<any[]>> {
  const b = base(network)
  if (!b) return { data: null, error: 'No indexer configured for this network' }
  try {
    // NearBlocks staking endpoints vary; try common path
    const json = await fetchJson(`${b}/account/${encodeURIComponent(accountId)}/staking`)
    const pools = json?.pools ?? json?.staking ?? (Array.isArray(json) ? json : [])
    return { data: pools, source: 'NearBlocks API' }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Staking data unavailable from indexer', source: 'NearBlocks API' }
  }
}

export async function getTxnDetail(network: NetworkId, txHash: string, sender: string): Promise<IndexerResult<any>> {
  const b = base(network)
  if (!b) return { data: null, error: 'No indexer configured for this network' }
  try {
    const json = await fetchJson(`${b}/txns/${encodeURIComponent(txHash)}`)
    return { data: json?.txns?.[0] ?? json, source: 'NearBlocks API' }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Indexer request failed', source: 'NearBlocks API' }
  }
}
