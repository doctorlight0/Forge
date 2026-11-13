import { TESTNET } from '../config'

export class RpcError extends Error {
  constructor(message: string, public status?: number, public code?: unknown) {
    super(message)
    this.name = 'RpcError'
  }
}

async function rpcCall<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(TESTNET.nodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'forge', method, params }),
  })
  if (!response.ok) throw new RpcError(`Testnet RPC returned HTTP ${response.status}`, response.status)
  const payload = await response.json()
  if (payload.error) throw new RpcError(payload.error.message || 'Testnet RPC error', response.status, payload.error)
  return payload.result as T
}

export const viewAccount = (accountId: string) => rpcCall<any>('query', { request_type: 'view_account', finality: 'final', account_id: accountId })
export const viewAccessKeys = (accountId: string) => rpcCall<any>('query', { request_type: 'view_access_key_list', finality: 'final', account_id: accountId })
export const viewAccountCode = (accountId: string) => rpcCall<any>('query', { request_type: 'view_code', finality: 'final', account_id: accountId })

export async function callViewFunction<T = any>(accountId: string, methodName: string, args: unknown = {}): Promise<T> {
  const argsBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(args))))
  const result = await rpcCall<any>('query', {
    request_type: 'call_function', finality: 'final', account_id: accountId, method_name: methodName, args_base64: argsBase64,
  })
  const decoded = new TextDecoder().decode(Uint8Array.from(result.result || []))
  return decoded ? JSON.parse(decoded) as T : (null as T)
}

export const getTxStatus = (txHash: string, senderAccountId: string) => rpcCall<any>('EXPERIMENTAL_tx_status', { tx_hash: txHash, sender_account_id: senderAccountId, wait_until: 'EXECUTED_OPTIMISTIC' })
export const getBlock = () => rpcCall<any>('block', { finality: 'final' })

export async function checkEndpoint(url: string, timeoutMs = 8000): Promise<{ ok: boolean; latencyMs?: number; error?: string; blockHeight?: number }> {
  const start = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'forge-check', method: 'block', params: { finality: 'final' } }), signal: controller.signal,
    })
    const latencyMs = Date.now() - start
    if (!response.ok) return { ok: false, latencyMs, error: `HTTP ${response.status}` }
    const payload = await response.json()
    if (payload.error) return { ok: false, latencyMs, error: payload.error.message || 'RPC error' }
    return { ok: true, latencyMs, blockHeight: payload.result?.header?.height }
  } catch (reason) {
    return { ok: false, latencyMs: Date.now() - start, error: reason instanceof Error ? reason.message : 'Request failed' }
  } finally { clearTimeout(timeout) }
}
