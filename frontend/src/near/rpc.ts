import { NETWORKS, type NetworkId } from '../config'

export class RpcError extends Error {
  constructor(message: string, public status?: number, public code?: unknown) {
    super(message)
    this.name = 'RpcError'
  }
}

async function rpcCall<T>(network: NetworkId, method: string, params: any): Promise<T> {
  const url = NETWORKS[network].nodeUrl
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'near-forge', method, params }),
  })
  if (!res.ok) throw new RpcError(`RPC HTTP ${res.status}`, res.status)
  const json = await res.json()
  if (json.error) throw new RpcError(json.error.message || 'RPC error', res.status, json.error)
  return json.result as T
}

export async function viewAccount(network: NetworkId, accountId: string) {
  return rpcCall<any>(network, 'query', { request_type: 'view_account', finality: 'final', account_id: accountId })
}

export async function viewAccessKeys(network: NetworkId, accountId: string) {
  return rpcCall<any>(network, 'query', { request_type: 'view_access_key_list', finality: 'final', account_id: accountId })
}

export async function viewAccountCode(network: NetworkId, accountId: string) {
  return rpcCall<any>(network, 'query', { request_type: 'view_code', finality: 'final', account_id: accountId })
}

export async function callViewFunction(network: NetworkId, accountId: string, methodName: string, args: any = {}) {
  const argsBase64 = btoa(JSON.stringify(args))
  return rpcCall<any>(network, 'query', {
    request_type: 'call_function', finality: 'final', account_id: accountId, method_name: methodName, args_base64: argsBase64,
  })
}

export async function getTxStatus(network: NetworkId, txHash: string, senderAccountId: string) {
  return rpcCall<any>(network, 'EXPERIMENTAL_tx_status', { tx_hash: txHash, sender_account_id: senderAccountId, wait_until: 'NONE' })
}

export async function getValidators(network: NetworkId) {
  return rpcCall<any>(network, 'validators', [null])
}

export async function getBlock(network: NetworkId) {
  return rpcCall<any>(network, 'block', { finality: 'final' })
}

export async function checkEndpoint(url: string, timeoutMs = 8000): Promise<{ ok: boolean; latencyMs?: number; error?: string; blockHeight?: number }> {
  const start = Date.now()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'check', method: 'block', params: { finality: 'final' } }),
      signal: ctrl.signal,
    })
    const latencyMs = Date.now() - start
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` }
    const json = await res.json()
    if (json.error) return { ok: false, latencyMs, error: json.error.message || 'RPC error' }
    return { ok: true, latencyMs, blockHeight: json.result?.header?.height }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : 'request failed' }
  } finally {
    clearTimeout(t)
  }
}
