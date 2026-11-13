import { BACKEND_URL, TESTNET } from '../config'

export type IndexerResult<T> = { data: T | null; error?: string; source: string }
export type AccountTxnPage = { txns: any[]; nextPage: string | null; prevPage: string | null }

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (response.status === 429) throw new Error('NearBlocks rate limit reached (HTTP 429). Retry shortly.')
  if (!response.ok) throw new Error(`Indexer returned HTTP ${response.status}`)
  return response.json()
}

async function safe<T>(url: string, pick: (payload: any) => T, unavailable = 'Indexer data unavailable'): Promise<IndexerResult<T>> {
  try { return { data: pick(await fetchJson(url)), source: 'NearBlocks Testnet API' } }
  catch (reason) { return { data: null, error: reason instanceof Error ? reason.message : unavailable, source: 'NearBlocks Testnet API' } }
}

export function getAccountTxns(accountId: string, cursor?: string, limit = 25) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('next', cursor)
  const direct = `${TESTNET.indexerBaseUrl}/accounts/${encodeURIComponent(accountId)}/txns?${params}`
  const proxied = `${BACKEND_URL}/api/indexer/account/${encodeURIComponent(accountId)}/txns?${params}`
  return safe<AccountTxnPage>(import.meta.env.VITE_USE_BACKEND_PROXY === 'true' ? proxied : direct, (payload) => ({
    txns: Array.isArray(payload?.data) ? payload.data : [],
    nextPage: payload?.meta?.next_page || null,
    prevPage: payload?.meta?.prev_page || null,
  }))
}

export const getFtTokens = (accountId: string) => safe<any[]>(`${TESTNET.indexerBaseUrl}/accounts/${encodeURIComponent(accountId)}/assets/fts?limit=50`, (payload) => Array.isArray(payload?.data) ? payload.data : [])
export const getNftTokens = (accountId: string) => safe<any[]>(`${TESTNET.indexerBaseUrl}/accounts/${encodeURIComponent(accountId)}/assets/nfts?limit=50`, (payload) => Array.isArray(payload?.data) ? payload.data : [])
export const getStakingPools = (accountId: string) => safe<any[]>(`${TESTNET.indexerBaseUrl}/kitwallet/staking-deposits/${encodeURIComponent(accountId)}`, (payload) => Array.isArray(payload) ? payload : [], 'Staking data unavailable')
export const getTxnDetail = (txHash: string) => safe<any>(`${TESTNET.indexerBaseUrl}/txns/${encodeURIComponent(txHash)}`, (payload) => payload?.data ?? null)
